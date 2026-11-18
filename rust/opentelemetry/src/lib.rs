// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

use anyhow::{bail, Result};
use opentelemetry::{
    logs::{LogRecord, Logger, LoggerProvider, Severity},
    propagation::TextMapPropagator,
    trace::{SpanKind, Status, TraceContextExt, Tracer, TracerProvider},
    Context, KeyValue,
};
use opentelemetry_sdk::{
    logs::SdkLoggerProvider,
    propagation::TraceContextPropagator,
    trace::{Sampler, SdkTracerProvider},
    Resource,
};
use serde::Deserialize;
use std::{collections::HashMap, time::SystemTime};

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

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub enabled: bool,
    pub service_name: String,
    pub context_propagation: bool,
    pub instrumentations: Instrumentations,
    pub exporter: Exporter,
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
        let trace_builder = SdkTracerProvider::builder()
            .with_sampler(Sampler::ParentBased(Box::new(Sampler::AlwaysOn)))
            .with_resource(resource.clone());
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

    pub fn logs_enabled(&self) -> bool {
        self.config.enabled && self.config.instrumentations.logs
    }

    pub fn context_enabled(&self) -> bool {
        self.config.enabled && self.config.context_propagation
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
