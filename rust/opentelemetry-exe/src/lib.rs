// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

//! OpenTelemetry sidecar for Azure Functions Node.js apps.
//!
//! The customer's app loads `@azure/functions-opentelemetry-native`, which observes
//! invocations and outgoing calls in Node.js and streams one JSON record per line to
//! this process. All OpenTelemetry SDK, exporter, batching and retry logic lives here,
//! so the app takes no OpenTelemetry npm dependencies.

use anyhow::{anyhow, bail, Context as _, Result};
use opentelemetry::{
    logs::{AnyValue, LogRecord as _, Logger as _, LoggerProvider as _, Severity},
    trace::{
        Span as _, SpanContext, SpanId, SpanKind, Status, TraceContextExt, TraceFlags, TraceId,
        TraceState, Tracer as _, TracerProvider as _,
    },
    Context, KeyValue, Value as OtelValue,
};
use opentelemetry_sdk::{
    logs::{SdkLogger, SdkLoggerProvider},
    trace::{Sampler, SdkTracer, SdkTracerProvider},
    Resource,
};
use serde::Deserialize;
use serde_json::{Map, Value};
use std::{
    str::FromStr,
    time::{Duration, SystemTime},
};

/// App setting that selects the exporter: `auto` (default), `otlp`, `azuremonitor`, `console` or `none`.
pub const EXPORTER_SETTING: &str = "AZURE_FUNCTIONS_OTEL_EXPORTER";
const SCOPE: &str = "azure-functions-opentelemetry-native";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ExporterKind {
    /// OTLP/HTTP, typically to an OpenTelemetry Collector that forwards to Azure Monitor.
    Otlp,
    /// Direct export to Application Insights (requires the `azure-monitor` feature).
    AzureMonitor,
    Console,
    None,
}

impl ExporterKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Otlp => "otlp",
            Self::AzureMonitor => "azuremonitor",
            Self::Console => "console",
            Self::None => "none",
        }
    }
}

#[derive(Clone, Debug)]
pub struct Settings {
    pub exporter: ExporterKind,
    /// Used only when `OTEL_SERVICE_NAME` is not set; the SDK reads that variable itself.
    pub fallback_service_name: String,
    pub connection_string: Option<String>,
}

impl Settings {
    /// Resolves settings from app settings, returning warnings for ignored values.
    ///
    /// <example>
    /// <code>
    /// let (settings, warnings) = Settings::from_lookup(|name| std::env::var(name).ok())?;
    /// </code>
    /// </example>
    pub fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Result<(Self, Vec<String>)> {
        let setting = |name: &str| {
            lookup(name)
                .map(|value| value.trim().to_owned())
                .filter(|value| !value.is_empty())
        };
        let mut warnings = Vec::new();
        let connection_string = setting("APPLICATIONINSIGHTS_CONNECTION_STRING");
        let otlp = setting("OTEL_EXPORTER_OTLP_ENDPOINT").is_some()
            || setting("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT").is_some();
        let requested = setting(EXPORTER_SETTING).map(|value| value.to_ascii_lowercase());
        let exporter = match requested.as_deref() {
            None | Some("auto") => {
                if otlp {
                    ExporterKind::Otlp
                } else if connection_string.is_some() && cfg!(feature = "azure-monitor") {
                    ExporterKind::AzureMonitor
                } else {
                    if connection_string.is_some() {
                        warnings.push(
                            "APPLICATIONINSIGHTS_CONNECTION_STRING is set but this build has no azure-monitor exporter; \
                             set OTEL_EXPORTER_OTLP_ENDPOINT to an OpenTelemetry Collector. Using console."
                                .to_owned(),
                        );
                    }
                    ExporterKind::Console
                }
            }
            Some("otlp") => ExporterKind::Otlp,
            Some("azuremonitor") => {
                if !cfg!(feature = "azure-monitor") {
                    bail!("{EXPORTER_SETTING}=azuremonitor requires building azfunc-otel with --features azure-monitor");
                }
                if connection_string.is_none() {
                    bail!("{EXPORTER_SETTING}=azuremonitor requires APPLICATIONINSIGHTS_CONNECTION_STRING");
                }
                ExporterKind::AzureMonitor
            }
            Some("console") => ExporterKind::Console,
            Some("none") => ExporterKind::None,
            Some(other) => bail!(
                "{EXPORTER_SETTING}='{other}' is not one of auto, otlp, azuremonitor, console or none"
            ),
        };
        let fallback_service_name =
            setting("WEBSITE_SITE_NAME").unwrap_or_else(|| "azure-functions-node".to_owned());
        Ok((
            Self {
                exporter,
                fallback_service_name,
                connection_string,
            },
            warnings,
        ))
    }
}

/// One line of the Node.js to sidecar protocol.
#[derive(Debug, Deserialize)]
#[serde(tag = "t", rename_all = "lowercase")]
pub enum Record {
    Span(SpanRecord),
    Log(LogRecordData),
    Flush,
}

#[derive(Clone, Copy, Debug, Default, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    #[default]
    Internal,
    Server,
    Client,
    Producer,
    Consumer,
}

impl From<Kind> for SpanKind {
    fn from(kind: Kind) -> Self {
        match kind {
            Kind::Internal => SpanKind::Internal,
            Kind::Server => SpanKind::Server,
            Kind::Client => SpanKind::Client,
            Kind::Producer => SpanKind::Producer,
            Kind::Consumer => SpanKind::Consumer,
        }
    }
}

/// A finished span. Node.js assigns the IDs because it already propagated them downstream.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpanRecord {
    pub name: String,
    #[serde(default)]
    pub kind: Kind,
    pub trace_id: String,
    pub span_id: String,
    pub parent_span_id: Option<String>,
    pub trace_state: Option<String>,
    /// Unix epoch nanoseconds as a decimal string (JSON numbers lose precision in JavaScript).
    pub start_ns: String,
    pub end_ns: String,
    pub error: Option<String>,
    #[serde(default)]
    pub attributes: Map<String, Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogRecordData {
    pub time_ns: String,
    pub severity: Option<String>,
    pub body: String,
    pub trace_id: Option<String>,
    pub span_id: Option<String>,
    #[serde(default)]
    pub attributes: Map<String, Value>,
}

pub struct Pipeline {
    traces: SdkTracerProvider,
    logs: SdkLoggerProvider,
    tracer: SdkTracer,
    logger: SdkLogger,
}

impl Pipeline {
    pub fn new(settings: &Settings) -> Result<Self> {
        let mut resource = Resource::builder().with_attributes([
            KeyValue::new("cloud.provider", "azure"),
            KeyValue::new("cloud.platform", "azure_functions"),
        ]);
        if std::env::var_os("OTEL_SERVICE_NAME").is_none() {
            resource = resource.with_service_name(settings.fallback_service_name.clone());
        }
        let resource = resource.build();
        // Node.js already made the sampling decision and only sends sampled spans.
        let traces = SdkTracerProvider::builder()
            .with_resource(resource.clone())
            .with_sampler(Sampler::AlwaysOn);
        let logs = SdkLoggerProvider::builder().with_resource(resource);
        let (traces, logs) = match settings.exporter {
            ExporterKind::None => (traces.build(), logs.build()),
            ExporterKind::Console => (
                traces
                    .with_simple_exporter(opentelemetry_stdout::SpanExporter::default())
                    .build(),
                logs.with_simple_exporter(opentelemetry_stdout::LogExporter::default())
                    .build(),
            ),
            ExporterKind::Otlp => (
                traces
                    .with_batch_exporter(
                        opentelemetry_otlp::SpanExporter::builder()
                            .with_http()
                            .build()?,
                    )
                    .build(),
                logs.with_batch_exporter(
                    opentelemetry_otlp::LogExporter::builder()
                        .with_http()
                        .build()?,
                )
                .build(),
            ),
            ExporterKind::AzureMonitor => azure_monitor(settings, traces, logs)?,
        };
        Ok(Self::from_providers(traces, logs))
    }

    pub fn from_providers(traces: SdkTracerProvider, logs: SdkLoggerProvider) -> Self {
        Self {
            tracer: traces.tracer(SCOPE),
            logger: logs.logger(SCOPE),
            traces,
            logs,
        }
    }

    pub fn handle_line(&self, line: &str) -> Result<()> {
        match serde_json::from_str::<Record>(line).context("invalid record")? {
            Record::Span(span) => self.record_span(span),
            Record::Log(log) => self.record_log(log),
            Record::Flush => self.flush(),
        }
    }

    pub fn record_span(&self, record: SpanRecord) -> Result<()> {
        let trace_id = TraceId::from_hex(&record.trace_id)
            .ok()
            .filter(|id| *id != TraceId::INVALID)
            .ok_or_else(|| anyhow!("invalid traceId '{}'", record.trace_id))?;
        let span_id = parse_span_id(&record.span_id)?;
        let trace_state = record
            .trace_state
            .as_deref()
            .and_then(|state| TraceState::from_str(state).ok())
            .unwrap_or_default();
        let parent = match record.parent_span_id.as_deref().filter(|id| !id.is_empty()) {
            Some(parent) => Context::new().with_remote_span_context(SpanContext::new(
                trace_id,
                parse_span_id(parent)?,
                TraceFlags::SAMPLED,
                true,
                trace_state,
            )),
            None => Context::new(),
        };
        let start = epoch(&record.start_ns)?;
        let end = epoch(&record.end_ns)?.max(start);
        let mut span = self
            .tracer
            .span_builder(record.name)
            .with_kind(record.kind.into())
            .with_trace_id(trace_id)
            .with_span_id(span_id)
            .with_start_time(start)
            .with_attributes(
                record
                    .attributes
                    .into_iter()
                    .filter_map(|(key, value)| Some(KeyValue::new(key, span_value(value)?))),
            )
            .start_with_context(&self.tracer, &parent);
        if let Some(error) = record.error.filter(|error| !error.is_empty()) {
            span.set_status(Status::error(error));
        }
        span.end_with_timestamp(end);
        Ok(())
    }

    pub fn record_log(&self, record: LogRecordData) -> Result<()> {
        let mut log = self.logger.create_log_record();
        let time = epoch(&record.time_ns)?;
        log.set_timestamp(time);
        log.set_observed_timestamp(time);
        log.set_body(record.body.into());
        let (severity, text) = severity(record.severity.as_deref());
        log.set_severity_number(severity);
        log.set_severity_text(text);
        if let (Some(trace_id), Some(span_id)) = (record.trace_id, record.span_id) {
            log.set_trace_context(
                TraceId::from_hex(&trace_id)?,
                parse_span_id(&span_id)?,
                Some(TraceFlags::SAMPLED),
            );
        }
        for (key, value) in record.attributes {
            if let Some(value) = log_value(value) {
                log.add_attribute(key, value);
            }
        }
        self.logger.emit(log);
        Ok(())
    }

    pub fn flush(&self) -> Result<()> {
        self.traces.force_flush()?;
        self.logs.force_flush()?;
        Ok(())
    }

    pub fn shutdown(&self) -> Result<()> {
        let traces = self.traces.shutdown();
        let logs = self.logs.shutdown();
        traces?;
        logs?;
        Ok(())
    }
}

#[cfg(feature = "azure-monitor")]
fn azure_monitor(
    settings: &Settings,
    traces: opentelemetry_sdk::trace::TracerProviderBuilder,
    logs: opentelemetry_sdk::logs::LoggerProviderBuilder,
) -> Result<(SdkTracerProvider, SdkLoggerProvider)> {
    let connection_string = settings
        .connection_string
        .clone()
        .ok_or_else(|| anyhow!("APPLICATIONINSIGHTS_CONNECTION_STRING is not set"))?;
    let exporter = opentelemetry_application_insights::Exporter::new_from_connection_string(
        connection_string,
        reqwest::blocking::Client::new(),
    )
    .map_err(|error| anyhow!("invalid APPLICATIONINSIGHTS_CONNECTION_STRING: {error}"))?;
    Ok((
        traces.with_batch_exporter(exporter.clone()).build(),
        logs.with_batch_exporter(exporter).build(),
    ))
}

#[cfg(not(feature = "azure-monitor"))]
fn azure_monitor(
    _: &Settings,
    _: opentelemetry_sdk::trace::TracerProviderBuilder,
    _: opentelemetry_sdk::logs::LoggerProviderBuilder,
) -> Result<(SdkTracerProvider, SdkLoggerProvider)> {
    bail!("this build of azfunc-otel does not include the azure-monitor exporter")
}

fn parse_span_id(value: &str) -> Result<SpanId> {
    SpanId::from_hex(value)
        .ok()
        .filter(|id| *id != SpanId::INVALID)
        .ok_or_else(|| anyhow!("invalid spanId '{value}'"))
}

fn epoch(value: &str) -> Result<SystemTime> {
    let nanos: u64 = value
        .parse()
        .with_context(|| format!("invalid epoch nanoseconds '{value}'"))?;
    Ok(SystemTime::UNIX_EPOCH + Duration::from_nanos(nanos))
}

fn span_value(value: Value) -> Option<OtelValue> {
    match value {
        Value::String(value) => Some(value.into()),
        Value::Bool(value) => Some(value.into()),
        Value::Number(number) => number
            .as_i64()
            .map(OtelValue::from)
            .or_else(|| number.as_f64().map(OtelValue::from)),
        Value::Null => None,
        other => Some(other.to_string().into()),
    }
}

fn log_value(value: Value) -> Option<AnyValue> {
    match value {
        Value::String(value) => Some(value.into()),
        Value::Bool(value) => Some(value.into()),
        Value::Number(number) => number
            .as_i64()
            .map(AnyValue::from)
            .or_else(|| number.as_f64().map(AnyValue::from)),
        Value::Null => None,
        other => Some(other.to_string().into()),
    }
}

fn severity(value: Option<&str>) -> (Severity, &'static str) {
    match value.unwrap_or("info").to_ascii_lowercase().as_str() {
        "trace" => (Severity::Trace, "trace"),
        "debug" => (Severity::Debug, "debug"),
        "warn" | "warning" => (Severity::Warn, "warning"),
        "error" => (Severity::Error, "error"),
        "critical" | "fatal" => (Severity::Fatal, "critical"),
        _ => (Severity::Info, "information"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use opentelemetry_sdk::{
        logs::InMemoryLogExporter,
        trace::{InMemorySpanExporter, SpanData},
    };
    use std::collections::HashMap;

    const TRACE: &str = "0af7651916cd43dd8448eb211c80319c";

    fn pipeline() -> (Pipeline, InMemorySpanExporter, InMemoryLogExporter) {
        let spans = InMemorySpanExporter::default();
        let logs = InMemoryLogExporter::default();
        let pipeline = Pipeline::from_providers(
            SdkTracerProvider::builder()
                .with_sampler(Sampler::AlwaysOn)
                .with_simple_exporter(spans.clone())
                .build(),
            SdkLoggerProvider::builder()
                .with_simple_exporter(logs.clone())
                .build(),
        );
        (pipeline, spans, logs)
    }

    fn only_span(exporter: &InMemorySpanExporter) -> SpanData {
        let mut spans = exporter.get_finished_spans().unwrap();
        assert_eq!(spans.len(), 1);
        spans.remove(0)
    }

    fn settings(values: &[(&str, &str)]) -> Result<(Settings, Vec<String>)> {
        let values: HashMap<_, _> = values.iter().copied().collect();
        Settings::from_lookup(|name| values.get(name).map(|value| value.to_string()))
    }

    #[test]
    fn auto_exporter_prefers_collector_endpoint() {
        let (selected, warnings) = settings(&[
            ("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318"),
            ("APPLICATIONINSIGHTS_CONNECTION_STRING", "InstrumentationKey=x"),
        ])
        .unwrap();
        assert_eq!(selected.exporter, ExporterKind::Otlp);
        assert!(warnings.is_empty());

        let (selected, _) = settings(&[]).unwrap();
        assert_eq!(selected.exporter, ExporterKind::Console);
        assert_eq!(selected.fallback_service_name, "azure-functions-node");
    }

    #[test]
    fn connection_string_uses_azure_monitor_only_when_compiled_in() {
        let (selected, warnings) =
            settings(&[("APPLICATIONINSIGHTS_CONNECTION_STRING", "InstrumentationKey=x")]).unwrap();
        if cfg!(feature = "azure-monitor") {
            assert_eq!(selected.exporter, ExporterKind::AzureMonitor);
            assert!(warnings.is_empty());
        } else {
            assert_eq!(selected.exporter, ExporterKind::Console);
            assert_eq!(warnings.len(), 1);
            assert!(settings(&[(EXPORTER_SETTING, "azuremonitor")]).is_err());
        }
        assert!(settings(&[(EXPORTER_SETTING, "zipkin")]).is_err());
    }

    #[test]
    fn span_keeps_ids_assigned_by_node() {
        let (pipeline, spans, _) = pipeline();
        pipeline
            .handle_line(&format!(
                r#"{{"t":"span","name":"GET","kind":"client","traceId":"{TRACE}","spanId":"00f067aa0ba902b7",
                    "parentSpanId":"b7ad6b7169203331","traceState":"az=1","startNs":"1700000000000000000",
                    "endNs":"1700000000250000000","error":"503",
                    "attributes":{{"http.response.status_code":503,"url.full":"http://x/","ok":false}}}}"#
            ))
            .unwrap();
        let span = only_span(&spans);
        assert_eq!(span.span_context.trace_id(), TraceId::from_hex(TRACE).unwrap());
        assert_eq!(span.span_context.span_id(), SpanId::from_hex("00f067aa0ba902b7").unwrap());
        assert_eq!(span.parent_span_id, SpanId::from_hex("b7ad6b7169203331").unwrap());
        assert_eq!(span.span_context.trace_state().header(), "az=1");
        assert_eq!(span.span_kind, SpanKind::Client);
        assert_eq!(
            span.end_time.duration_since(span.start_time).unwrap(),
            Duration::from_millis(250)
        );
        assert!(matches!(span.status, Status::Error { .. }));
        assert!(span.attributes.contains(&KeyValue::new("http.response.status_code", 503)));
        assert!(span.attributes.contains(&KeyValue::new("ok", false)));
    }

    #[test]
    fn root_span_uses_trace_id_from_node() {
        let (pipeline, spans, _) = pipeline();
        pipeline
            .handle_line(&format!(
                r#"{{"t":"span","name":"hello","kind":"server","traceId":"{TRACE}","spanId":"00f067aa0ba902b7",
                    "startNs":"1","endNs":"2"}}"#
            ))
            .unwrap();
        let span = only_span(&spans);
        assert_eq!(span.span_context.trace_id(), TraceId::from_hex(TRACE).unwrap());
        assert_eq!(span.parent_span_id, SpanId::INVALID);
    }

    #[test]
    fn log_is_correlated_with_span() {
        let (pipeline, _, logs) = pipeline();
        pipeline
            .handle_line(&format!(
                r#"{{"t":"log","timeNs":"1700000000000000000","severity":"warn","body":"hi",
                    "traceId":"{TRACE}","spanId":"00f067aa0ba902b7","attributes":{{"faas.name":"hello"}}}}"#
            ))
            .unwrap();
        let emitted = logs.get_emitted_logs().unwrap();
        assert_eq!(emitted.len(), 1);
        let record = &emitted[0].record;
        assert_eq!(record.severity_number(), Some(Severity::Warn));
        assert_eq!(
            record.trace_context().map(|context| context.trace_id),
            Some(TraceId::from_hex(TRACE).unwrap())
        );
    }

    #[test]
    fn invalid_records_are_rejected() {
        let (pipeline, spans, _) = pipeline();
        assert!(pipeline.handle_line("not json").is_err());
        assert!(pipeline
            .handle_line(r#"{"t":"span","name":"x","traceId":"00000000000000000000000000000000","spanId":"00f067aa0ba902b7","startNs":"1","endNs":"2"}"#)
            .is_err());
        assert!(spans.get_finished_spans().unwrap().is_empty());
    }
}
