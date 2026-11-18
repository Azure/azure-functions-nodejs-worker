// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

use anyhow::{bail, Result};
use opentelemetry::{
    logs::{LogRecord, Logger, LoggerProvider, Severity},
    propagation::TextMapPropagator,
    trace::{Span, SpanId, SpanKind, Status, TraceContextExt, Tracer, TracerProvider},
    Context, KeyValue,
};
use opentelemetry_sdk::{
    logs::SdkLoggerProvider,
    propagation::TraceContextPropagator,
    trace::{Sampler, SdkTracerProvider},
    Resource,
};
use serde::Deserialize;
use std::{
    collections::HashMap,
    time::{Duration, SystemTime},
};

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Instrumentations {
    pub http: bool,
    pub functions: bool,
    pub logs: bool,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Exporter {
    Console,
    Otlp,
}

/// Outgoing calls made by customer code that the worker instruments natively.
/// Node.js only reports timings and attributes; Rust creates and exports the spans.
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct ClientInstrumentations {
    pub http: bool,
    pub dns: bool,
    pub fetch: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ClientKind {
    Http,
    Dns,
    Fetch,
}

impl ClientKind {
    pub const ALL: [ClientKind; 3] = [ClientKind::Http, ClientKind::Dns, ClientKind::Fetch];

    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "http" => Some(Self::Http),
            "dns" => Some(Self::Dns),
            "fetch" => Some(Self::Fetch),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Http => "http",
            Self::Dns => "dns",
            Self::Fetch => "fetch",
        }
    }
}

impl ClientInstrumentations {
    pub fn is_enabled(&self, kind: ClientKind) -> bool {
        match kind {
            ClientKind::Http => self.http,
            ClientKind::Dns => self.dns,
            ClientKind::Fetch => self.fetch,
        }
    }

    fn set(&mut self, kind: ClientKind, enabled: bool) {
        match kind {
            ClientKind::Http => self.http = enabled,
            ClientKind::Dns => self.dns = enabled,
            ClientKind::Fetch => self.fetch = enabled,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub enabled: bool,
    pub service_name: String,
    pub context_propagation: bool,
    pub instrumentations: Instrumentations,
    #[serde(default)]
    pub client_instrumentations: ClientInstrumentations,
    pub exporter: Exporter,
}

/// App setting that turns on the worker's native OpenTelemetry pipeline.
pub const OTEL_WORKER_DEFAULT: &str = "OTEL_WORKER_DEFAULT";
/// App setting listing opt-in client instrumentations, for example `http,dns,fetch`.
pub const OTEL_WORKER_ENABLE: &str = "OTEL_WORKER_ENABLE";

impl Config {
    /// Applies customer app settings on top of the worker configuration file.
    ///
    /// `OTEL_WORKER_DEFAULT=true` enables invocation spans, logs and context
    /// propagation, and selects OTLP when an OTLP endpoint is configured or the
    /// console exporter otherwise. `OTEL_WORKER_DEFAULT=false` turns telemetry off.
    /// `OTEL_WORKER_ENABLE` opts in to client instrumentations and only applies
    /// when `OTEL_WORKER_DEFAULT=true`. Returns warnings for ignored values.
    ///
    /// <example>
    /// <code>
    /// let (config, warnings) = config.with_app_settings(|name| std::env::var(name).ok());
    /// </code>
    /// </example>
    pub fn with_app_settings(
        mut self,
        lookup: impl Fn(&str) -> Option<String>,
    ) -> (Self, Vec<String>) {
        let mut warnings = Vec::new();
        let setting = |name: &str| {
            lookup(name)
                .map(|value| value.trim().to_owned())
                .filter(|value| !value.is_empty())
        };
        let default = match setting(OTEL_WORKER_DEFAULT) {
            None => None,
            Some(value) => match value.to_ascii_lowercase().as_str() {
                "true" | "1" => Some(true),
                "false" | "0" => Some(false),
                _ => {
                    warnings.push(format!(
                        "{OTEL_WORKER_DEFAULT}='{value}' is not true or false; ignoring it"
                    ));
                    None
                }
            },
        };
        match default {
            Some(true) => {
                self.enabled = true;
                self.context_propagation = true;
                self.instrumentations = Instrumentations {
                    http: true,
                    functions: true,
                    logs: true,
                };
                self.exporter = if setting("OTEL_EXPORTER_OTLP_ENDPOINT").is_some()
                    || setting("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT").is_some()
                {
                    Exporter::Otlp
                } else {
                    Exporter::Console
                };
                if let Some(name) =
                    setting("OTEL_SERVICE_NAME").or_else(|| setting("WEBSITE_SITE_NAME"))
                {
                    self.service_name = name;
                }
            }
            Some(false) => self.enabled = false,
            None => {}
        }
        if let Some(value) = setting(OTEL_WORKER_ENABLE) {
            if default == Some(true) {
                let mut selected = ClientInstrumentations::default();
                for item in value.split(',').filter(|item| !item.trim().is_empty()) {
                    match ClientKind::parse(item) {
                        Some(kind) => selected.set(kind, true),
                        None => warnings.push(format!(
                            "{OTEL_WORKER_ENABLE} contains unknown instrumentation '{}'; supported values are http, dns and fetch",
                            item.trim()
                        )),
                    }
                }
                self.client_instrumentations = selected;
            } else {
                warnings.push(format!(
                    "{OTEL_WORKER_ENABLE} is ignored because {OTEL_WORKER_DEFAULT} is not true"
                ));
            }
        }
        (self, warnings)
    }

    /// Client instrumentations that are active, in a stable order.
    pub fn enabled_client_instrumentations(&self) -> Vec<ClientKind> {
        if !self.enabled {
            return Vec::new();
        }
        ClientKind::ALL
            .into_iter()
            .filter(|kind| self.client_instrumentations.is_enabled(*kind))
            .collect()
    }
}

pub struct Telemetry {
    config: Config,
    traces: SdkTracerProvider,
    logs: SdkLoggerProvider,
}

pub struct InvocationInfo<'a> {
    pub name: &'a str,
    pub invocation_id: &'a str,
    pub http_method: Option<&'a str>,
    pub http_route: Option<&'a str>,
}

pub struct Invocation {
    context: Context,
    owns_span: bool,
    http_route: Option<String>,
    http_method: Option<String>,
}

impl Telemetry {
    pub fn new(config: Config) -> Result<Self> {
        if config.service_name.trim().is_empty() {
            bail!("telemetry.service_name must not be empty");
        }
        let resource = Resource::builder()
            .with_service_name(config.service_name.clone())
            .build();
        let mut trace_builder = SdkTracerProvider::builder().with_resource(resource.clone());
        // The SDK reads OTEL_TRACES_SAMPLER itself; only apply our default when it is unset.
        if std::env::var_os("OTEL_TRACES_SAMPLER").is_none() {
            trace_builder =
                trace_builder.with_sampler(Sampler::ParentBased(Box::new(Sampler::AlwaysOn)));
        }
        let log_builder = SdkLoggerProvider::builder().with_resource(resource);
        let (traces, logs) = if !config.enabled {
            (trace_builder.build(), log_builder.build())
        } else {
            match config.exporter {
                Exporter::Console => (
                    trace_builder
                        .with_simple_exporter(opentelemetry_stdout::SpanExporter::default())
                        .build(),
                    log_builder
                        .with_simple_exporter(opentelemetry_stdout::LogExporter::default())
                        .build(),
                ),
                Exporter::Otlp => (
                    trace_builder
                        .with_batch_exporter(
                            opentelemetry_otlp::SpanExporter::builder()
                                .with_http()
                                .build()?,
                        )
                        .build(),
                    log_builder
                        .with_batch_exporter(
                            opentelemetry_otlp::LogExporter::builder()
                                .with_http()
                                .build()?,
                        )
                        .build(),
                ),
            }
        };
        Ok(Self {
            config,
            traces,
            logs,
        })
    }

    pub fn enabled(&self) -> bool {
        self.config.enabled
    }

    pub fn logs_enabled(&self) -> bool {
        self.config.enabled && self.config.instrumentations.logs
    }

    pub fn context_enabled(&self) -> bool {
        // Client spans need the invocation context in Node.js to find their parent.
        self.config.enabled
            && (self.config.context_propagation
                || !self.config.enabled_client_instrumentations().is_empty())
    }

    pub fn client_instrumentations(&self) -> Vec<ClientKind> {
        self.config.enabled_client_instrumentations()
    }

    pub fn begin(&self, info: InvocationInfo<'_>, carrier: &HashMap<String, String>) -> Invocation {
        let parent = if self.context_enabled() {
            TraceContextPropagator::new().extract(carrier)
        } else {
            Context::new()
        };
        let enabled = self.config.enabled
            && if info.http_method.is_some() {
                self.config.instrumentations.http
            } else {
                self.config.instrumentations.functions
            };
        if !enabled {
            return Invocation {
                context: parent,
                owns_span: false,
                http_route: None,
                http_method: None,
            };
        }
        let mut attributes = vec![
            KeyValue::new("faas.name", info.name.to_owned()),
            KeyValue::new("faas.invocation_id", info.invocation_id.to_owned()),
        ];
        let (name, kind) = if let Some(method) = info.http_method {
            let method = if method.is_empty() { "_OTHER" } else { method };
            let route = info.http_route.unwrap_or(info.name);
            attributes.push(KeyValue::new("http.route", route.to_owned()));
            (format!("{method} {route}"), SpanKind::Server)
        } else {
            (info.name.to_owned(), SpanKind::Internal)
        };
        let tracer = self.traces.tracer("azure-functions-rust");
        let span = tracer
            .span_builder(name)
            .with_kind(kind)
            .with_attributes(attributes)
            .start_with_context(&tracer, &parent);
        Invocation {
            context: parent.with_span(span),
            owns_span: true,
            http_route: info
                .http_method
                .map(|_| info.http_route.unwrap_or(info.name).to_owned()),
            http_method: info.http_method.map(|method| {
                if method.is_empty() {
                    "_OTHER".to_owned()
                } else {
                    method.to_owned()
                }
            }),
        }
    }

    pub fn emit_log(
        &self,
        message: &str,
        level: i32,
        category: &str,
        invocation: Option<&Invocation>,
        carrier: Option<&HashMap<String, String>>,
    ) {
        if !self.logs_enabled() {
            return;
        }
        let logger = self.logs.logger("azure-functions-rust");
        let mut record = logger.create_log_record();
        let (severity, text) = severity(level);
        record.set_timestamp(SystemTime::now());
        record.set_body(message.to_owned().into());
        record.set_severity_text(text);
        if let Some(severity) = severity {
            record.set_severity_number(severity);
        }
        record.add_attribute("CategoryName", category.to_owned());
        let extracted = carrier.map(|carrier| TraceContextPropagator::new().extract(carrier));
        let log_context = extracted
            .as_ref()
            .filter(|context| context.span().span_context().is_valid())
            .or_else(|| invocation.map(|invocation| &invocation.context))
            .filter(|context| context.span().span_context().is_valid());
        if let Some(context) = log_context {
            let span = context.span();
            let context = span.span_context();
            record.set_trace_context(
                context.trace_id(),
                context.span_id(),
                Some(context.trace_flags()),
            );
        }
        logger.emit(record);
    }

    pub fn client_enabled(&self, kind: ClientKind) -> bool {
        self.config.enabled && self.config.client_instrumentations.is_enabled(kind)
    }

    /// Records a client span reported by the Node.js instrumentation hooks.
    ///
    /// The event carries `kind`, `name`, the parent `traceparent`/`tracestate`,
    /// an optional `spanId` already injected into the outgoing request,
    /// `startNs`/`endNs` (Unix epoch nanoseconds), an optional `error`, and
    /// attributes prefixed with `a:` (string) or `i:` (integer).
    /// Calls without a valid parent invocation context are ignored.
    pub fn record_client_span(&self, event: &HashMap<String, String>) -> Result<()> {
        let Some(kind) = event.get("kind").and_then(|kind| ClientKind::parse(kind)) else {
            bail!("client span has an unknown kind");
        };
        if !self.client_enabled(kind) {
            return Ok(());
        }
        let parent = TraceContextPropagator::new().extract(event);
        if !parent.span().span_context().is_valid() {
            return Ok(());
        }
        let time = |name: &str| -> Result<SystemTime> {
            let nanos: u64 = event
                .get(name)
                .ok_or_else(|| anyhow::anyhow!("client span is missing {name}"))?
                .parse()?;
            Ok(SystemTime::UNIX_EPOCH + Duration::from_nanos(nanos))
        };
        let start = time("startNs")?;
        let end = time("endNs")?.max(start);
        let mut attributes = Vec::new();
        for (key, value) in event {
            if let Some(key) = key.strip_prefix("a:") {
                attributes.push(KeyValue::new(key.to_owned(), value.clone()));
            } else if let Some(key) = key.strip_prefix("i:") {
                if let Ok(value) = value.parse::<i64>() {
                    attributes.push(KeyValue::new(key.to_owned(), value));
                }
            }
        }
        let name = event
            .get("name")
            .filter(|name| !name.is_empty())
            .cloned()
            .unwrap_or_else(|| kind.as_str().to_owned());
        let tracer = self.traces.tracer("azure-functions-rust");
        let mut builder = tracer
            .span_builder(name)
            .with_kind(SpanKind::Client)
            .with_start_time(start)
            .with_attributes(attributes);
        if let Some(span_id) = event.get("spanId") {
            builder = builder.with_span_id(SpanId::from_hex(span_id)?);
        }
        let mut span = builder.start_with_context(&tracer, &parent);
        if let Some(error) = event.get("error").filter(|error| !error.is_empty()) {
            span.set_status(Status::error(error.clone()));
        }
        span.end_with_timestamp(end);
        Ok(())
    }

    pub fn shutdown(&self) -> Result<()> {
        let traces = self.traces.shutdown();
        let logs = self.logs.shutdown();
        if let Err(error) = &traces {
            eprintln!("Rust trace shutdown failed: {error}");
        }
        if let Err(error) = &logs {
            eprintln!("Rust log shutdown failed: {error}");
        }
        traces?;
        logs?;
        Ok(())
    }
}

impl Invocation {
    pub fn update_http_method(&mut self, method: &str) {
        if self.owns_span {
            if let Some(route) = &self.http_route {
                let span = self.context.span();
                span.update_name(format!("{method} {route}"));
                self.http_method = Some(method.to_owned());
            }
        }
    }

    pub fn carrier(&self) -> HashMap<String, String> {
        let mut carrier = HashMap::new();
        TraceContextPropagator::new().inject_context(&self.context, &mut carrier);
        carrier
    }

    pub fn finish(self, failed: bool, http_status: Option<u16>) {
        if !self.owns_span {
            return;
        }
        let span = self.context.span();
        if let Some(method) = self.http_method {
            span.set_attribute(KeyValue::new("http.request.method", method));
        }
        if let Some(status) = http_status {
            span.set_attribute(KeyValue::new(
                "http.response.status_code",
                i64::from(status),
            ));
        }
        if failed || http_status.is_some_and(|status| status >= 500) {
            span.set_status(Status::error("Function invocation failed"));
        }
        span.end();
    }
}

fn severity(level: i32) -> (Option<Severity>, &'static str) {
    match level {
        0 => (Some(Severity::Trace), "trace"),
        1 => (Some(Severity::Debug), "debug"),
        2 => (Some(Severity::Info), "information"),
        3 => (Some(Severity::Warn), "warning"),
        4 => (Some(Severity::Error), "error"),
        5 => (Some(Severity::Fatal), "critical"),
        _ => (None, "unspecified"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use opentelemetry_sdk::{
        logs::InMemoryLogExporter,
        trace::{InMemorySpanExporter, Sampler},
    };

    fn telemetry(enabled: bool) -> (Telemetry, InMemorySpanExporter, InMemoryLogExporter) {
        let spans = InMemorySpanExporter::default();
        let logs = InMemoryLogExporter::default();
        let telemetry = Telemetry {
            config: Config {
                enabled,
                service_name: "test".into(),
                context_propagation: true,
                instrumentations: Instrumentations {
                    http: true,
                    functions: true,
                    logs: true,
                },
                client_instrumentations: ClientInstrumentations {
                    http: true,
                    dns: false,
                    fetch: true,
                },
                exporter: Exporter::Console,
            },
            traces: SdkTracerProvider::builder()
                .with_sampler(Sampler::ParentBased(Box::new(Sampler::AlwaysOn)))
                .with_simple_exporter(spans.clone())
                .build(),
            logs: SdkLoggerProvider::builder()
                .with_simple_exporter(logs.clone())
                .build(),
        };
        (telemetry, spans, logs)
    }

    fn file_config() -> Config {
        serde_json::from_str(
            r#"{"enabled":false,"service_name":"file","context_propagation":false,
                "instrumentations":{"http":false,"functions":false,"logs":false},
                "exporter":"otlp"}"#,
        )
        .unwrap()
    }

    fn settings(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let map: HashMap<String, String> = pairs
            .iter()
            .map(|(key, value)| ((*key).to_owned(), (*value).to_owned()))
            .collect();
        move |name| map.get(name).cloned()
    }

    #[test]
    fn worker_default_enables_the_native_pipeline_and_selected_client_instrumentations() {
        let (config, warnings) = file_config().with_app_settings(settings(&[
            (OTEL_WORKER_DEFAULT, "TRUE"),
            (OTEL_WORKER_ENABLE, " http, fetch ,ftp"),
            ("WEBSITE_SITE_NAME", "contoso"),
        ]));
        assert!(config.enabled && config.context_propagation);
        assert!(config.instrumentations.http && config.instrumentations.functions);
        assert!(config.instrumentations.logs);
        assert!(matches!(config.exporter, Exporter::Console));
        assert_eq!(config.service_name, "contoso");
        assert_eq!(
            config.enabled_client_instrumentations(),
            [ClientKind::Http, ClientKind::Fetch]
        );
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("'ftp'"));

        let (config, _) = file_config().with_app_settings(settings(&[
            (OTEL_WORKER_DEFAULT, "1"),
            ("OTEL_EXPORTER_OTLP_ENDPOINT", "http://collector:4318"),
            ("OTEL_SERVICE_NAME", "explicit"),
            ("WEBSITE_SITE_NAME", "contoso"),
        ]));
        assert!(matches!(config.exporter, Exporter::Otlp));
        assert_eq!(config.service_name, "explicit");
        assert!(config.enabled_client_instrumentations().is_empty());
    }

    #[test]
    fn worker_enable_requires_worker_default_and_false_turns_telemetry_off() {
        let mut enabled = file_config();
        enabled.enabled = true;
        let (config, warnings) =
            enabled.with_app_settings(settings(&[(OTEL_WORKER_ENABLE, "http,dns")]));
        assert!(config.enabled);
        assert!(config.enabled_client_instrumentations().is_empty());
        assert_eq!(warnings.len(), 1);

        let mut enabled = file_config();
        enabled.enabled = true;
        enabled.client_instrumentations.dns = true;
        let (config, warnings) =
            enabled.with_app_settings(settings(&[(OTEL_WORKER_DEFAULT, "false")]));
        assert!(!config.enabled);
        assert!(config.enabled_client_instrumentations().is_empty());
        assert!(warnings.is_empty());

        let (config, warnings) =
            file_config().with_app_settings(settings(&[(OTEL_WORKER_DEFAULT, "maybe")]));
        assert!(!config.enabled);
        assert_eq!(warnings.len(), 1);
    }

    fn client_event(kind: &str, span_id: Option<&str>) -> HashMap<String, String> {
        let mut event = HashMap::from([
            ("event".into(), "clientSpan".into()),
            ("kind".into(), kind.into()),
            ("name".into(), "GET".into()),
            (
                "traceparent".into(),
                "00-12345678901234567890123456789012-1234567890123456-01".into(),
            ),
            ("startNs".into(), "1700000000000000000".into()),
            ("endNs".into(), "1700000000250000000".into()),
            ("a:url.full".into(), "http://example.com/".into()),
            ("i:http.response.status_code".into(), "503".into()),
            ("error".into(), "503".into()),
        ]);
        if let Some(span_id) = span_id {
            event.insert("spanId".into(), span_id.into());
        }
        event
    }

    #[test]
    fn client_spans_use_the_invocation_parent_injected_span_id_and_reported_timing() {
        let (telemetry, spans, _) = telemetry(true);
        telemetry
            .record_client_span(&client_event("http", Some("abcdefabcdefabcd")))
            .unwrap();
        let spans = spans.get_finished_spans().unwrap();
        assert_eq!(spans.len(), 1);
        let span = &spans[0];
        assert_eq!(span.span_kind, SpanKind::Client);
        assert_eq!(span.name, "GET");
        assert_eq!(span.span_context.span_id().to_string(), "abcdefabcdefabcd");
        assert_eq!(span.parent_span_id.to_string(), "1234567890123456");
        assert_eq!(
            span.span_context.trace_id().to_string(),
            "12345678901234567890123456789012"
        );
        assert_eq!(
            span.end_time.duration_since(span.start_time).unwrap(),
            Duration::from_millis(250)
        );
        assert!(span
            .attributes
            .contains(&KeyValue::new("http.response.status_code", 503_i64)));
        assert!(span
            .attributes
            .contains(&KeyValue::new("url.full", "http://example.com/")));
        assert!(matches!(span.status, Status::Error { .. }));
    }

    #[test]
    fn client_spans_are_skipped_when_disabled_or_outside_an_invocation() {
        let (worker, spans, _) = telemetry(true);
        worker
            .record_client_span(&client_event("dns", None))
            .unwrap();
        let mut orphan = client_event("fetch", None);
        orphan.remove("traceparent");
        worker.record_client_span(&orphan).unwrap();
        assert!(worker
            .record_client_span(&client_event("smtp", None))
            .is_err());
        assert!(spans.get_finished_spans().unwrap().is_empty());

        let (disabled, spans, _) = telemetry(false);
        disabled
            .record_client_span(&client_event("http", None))
            .unwrap();
        assert!(spans.get_finished_spans().unwrap().is_empty());
    }

    #[test]
    fn http_spans_and_logs_share_the_host_trace_and_native_span() {
        let (telemetry, spans, logs) = telemetry(true);
        let carrier = HashMap::from([
            (
                "traceparent".into(),
                "00-12345678901234567890123456789012-1234567890123456-01".into(),
            ),
            ("tracestate".into(), "vendor=value".into()),
        ]);
        let invocation = telemetry.begin(
            InvocationInfo {
                name: "hello",
                invocation_id: "one",
                http_method: Some("GET"),
                http_route: Some("hello"),
            },
            &carrier,
        );
        let native_parent = invocation.carrier();
        assert_eq!(native_parent["tracestate"], "vendor=value");
        telemetry.emit_log("hello", 3, "user", Some(&invocation), None);
        invocation.finish(false, Some(503));
        let spans = spans.get_finished_spans().unwrap();
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].span_kind, SpanKind::Server);
        assert_eq!(spans[0].parent_span_id.to_string(), "1234567890123456");
        assert_eq!(
            spans[0].span_context.trace_id().to_string(),
            "12345678901234567890123456789012"
        );
        assert!(matches!(spans[0].status, Status::Error { .. }));
        let logs = logs.get_emitted_logs().unwrap();
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].record.severity_number(), Some(Severity::Warn));
        assert_eq!(
            logs[0].record.trace_context().unwrap().span_id,
            spans[0].span_context.span_id()
        );
    }

    #[test]
    fn disabled_telemetry_does_not_export_or_create_context() {
        let (telemetry, spans, logs) = telemetry(false);
        let invocation = telemetry.begin(
            InvocationInfo {
                name: "hello",
                invocation_id: "one",
                http_method: None,
                http_route: None,
            },
            &HashMap::new(),
        );
        assert!(invocation.carrier().is_empty());
        telemetry.emit_log("hello", 2, "user", Some(&invocation), None);
        invocation.finish(false, None);
        assert!(spans.get_finished_spans().unwrap().is_empty());
        assert!(logs.get_emitted_logs().unwrap().is_empty());
    }

    #[test]
    fn all_worker_log_levels_have_the_original_severity_mapping() {
        for (level, expected) in [(0, 1), (1, 5), (2, 9), (3, 13), (4, 17), (5, 21)] {
            assert_eq!(severity(level).0.unwrap() as i32, expected);
        }
        assert_eq!(severity(6).0, None);
    }

    #[test]
    fn unsampled_host_parents_do_not_export_spans() {
        let (telemetry, spans, _) = telemetry(true);
        let carrier = HashMap::from([(
            "traceparent".into(),
            "00-12345678901234567890123456789012-1234567890123456-00".into(),
        )]);
        let invocation = telemetry.begin(
            InvocationInfo {
                name: "hello",
                invocation_id: "one",
                http_method: None,
                http_route: None,
            },
            &carrier,
        );
        assert!(invocation.carrier()["traceparent"].ends_with("-00"));
        invocation.finish(false, None);
        assert!(spans.get_finished_spans().unwrap().is_empty());
    }

    #[test]
    fn late_async_logs_keep_the_node_context_after_invocation_completion() {
        let (telemetry, spans, logs) = telemetry(true);
        let invocation = telemetry.begin(
            InvocationInfo {
                name: "hello",
                invocation_id: "one",
                http_method: None,
                http_route: None,
            },
            &HashMap::new(),
        );
        let carrier = invocation.carrier();
        invocation.finish(false, None);
        telemetry.emit_log("late", 2, "user", None, Some(&carrier));
        let logs = logs.get_emitted_logs().unwrap();
        let spans = spans.get_finished_spans().unwrap();
        assert_eq!(
            logs[0].record.trace_context().unwrap().span_id,
            spans[0].span_context.span_id()
        );
        assert_eq!(
            logs[0].record.trace_context().unwrap().trace_id,
            spans[0].span_context.trace_id()
        );
    }
}
