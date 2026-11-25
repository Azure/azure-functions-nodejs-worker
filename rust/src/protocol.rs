// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

use anyhow::{bail, Context, Result};
use azure_functions_opentelemetry_rust::{Invocation, InvocationInfo, Telemetry};
use std::collections::HashMap;

tonic::include_proto!("_");

pub mod rpc {
    tonic::include_proto!("azure_functions_rpc_messages");
}

use rpc::{
    parameter_binding::RpcData, streaming_message::Content, typed_data::Data, RpcFunctionMetadata,
    StreamingMessage,
};

fn data(binding: &rpc::ParameterBinding) -> Option<&Data> {
    match binding.rpc_data.as_ref() {
        Some(RpcData::Data(data)) => data.data.as_ref(),
        _ => None,
    }
}

struct FunctionInfo {
    name: String,
    route: Option<String>,
}

pub struct Protocol {
    pub telemetry: Telemetry,
    functions: HashMap<String, FunctionInfo>,
    invocations: HashMap<String, Invocation>,
}

impl Protocol {
    pub fn new(telemetry: Telemetry) -> Self {
        Self {
            telemetry,
            functions: HashMap::new(),
            invocations: HashMap::new(),
        }
    }

    fn register(&mut self, metadata: &RpcFunctionMetadata, id: &str) -> Result<()> {
        let mut route = None;
        for raw in &metadata.raw_bindings {
            let binding: serde_json::Value =
                serde_json::from_str(raw).context("invalid indexed binding JSON")?;
            if binding["type"]
                .as_str()
                .is_some_and(|t| t.eq_ignore_ascii_case("httpTrigger"))
            {
                route = Some(
                    binding["route"]
                        .as_str()
                        .unwrap_or(&metadata.name)
                        .to_owned(),
                );
            }
        }
        self.functions.insert(
            id.to_owned(),
            FunctionInfo {
                name: metadata.name.clone(),
                route,
            },
        );
        Ok(())
    }

    pub fn handle_host_message(&mut self, message: &mut StreamingMessage) -> Result<()> {
        match message.content.as_mut() {
            Some(Content::FunctionEnvironmentReloadRequest(_)) => self.functions.clear(),
            Some(Content::FunctionLoadRequest(request)) => {
                if let Some(metadata) = &request.metadata {
                    self.register(metadata, &request.function_id)?;
                }
            }
            Some(Content::InvocationRequest(request)) => {
                if self.invocations.contains_key(&request.invocation_id) {
                    bail!("duplicate active invocation id: {}", request.invocation_id);
                }
                let info = self.functions.get(&request.function_id);
                let http = request
                    .input_data
                    .iter()
                    .find_map(|input| match data(input) {
                        Some(Data::Http(http)) => Some(http),
                        _ => None,
                    });
                let carrier = request
                    .trace_context
                    .as_ref()
                    .map(|trace| {
                        HashMap::from([
                            ("traceparent".into(), trace.trace_parent.clone()),
                            ("tracestate".into(), trace.trace_state.clone()),
                        ])
                    })
                    .unwrap_or_default();
                let invocation = self.telemetry.begin(
                    InvocationInfo {
                        name: info
                            .map(|info| info.name.as_str())
                            .unwrap_or(&request.function_id),
                        invocation_id: &request.invocation_id,
                        http_method: http.map(|http| http.method.as_str()),
                        http_route: info.and_then(|info| info.route.as_deref()),
                    },
                    &carrier,
                );
                if self.telemetry.context_enabled() {
                    let carrier = invocation.carrier();
                    if let Some(parent) = carrier.get("traceparent") {
                        let context = request.trace_context.get_or_insert_default();
                        context.trace_parent = parent.clone();
                        context.trace_state =
                            carrier.get("tracestate").cloned().unwrap_or_default();
                    }
                }
                self.invocations
                    .insert(request.invocation_id.clone(), invocation);
            }
            _ => {}
        }
        Ok(())
    }

    pub fn handle_engine_message(
        &mut self,
        message: &mut StreamingMessage,
        carrier: &HashMap<String, String>,
    ) -> Result<()> {
        match message.content.as_mut() {
            Some(Content::WorkerInitResponse(response)) => {
                if self.telemetry.logs_enabled() {
                    response
                        .capabilities
                        .insert("WorkerOpenTelemetryEnabled".into(), "true".into());
                }
                if let Some(metadata) = response.worker_metadata.as_mut() {
                    metadata.custom_properties.insert(
                        "rustTransportVersion".into(),
                        env!("CARGO_PKG_VERSION").into(),
                    );
                    metadata
                        .custom_properties
                        .insert("executionEngine".into(), "nodejs".into());
                }
            }
            Some(Content::FunctionEnvironmentReloadResponse(response)) => {
                if self.telemetry.logs_enabled() {
                    response
                        .capabilities
                        .insert("WorkerOpenTelemetryEnabled".into(), "true".into());
                }
            }
            Some(Content::FunctionMetadataResponse(response)) => {
                for metadata in &response.function_metadata_results {
                    self.register(metadata, &metadata.function_id)?;
                }
            }
            Some(Content::RpcLog(log)) => {
                let category = match log.log_category {
                    0 => "user",
                    1 => "system",
                    _ => "customMetric",
                };
                self.telemetry.emit_log(
                    &log.message,
                    log.level,
                    category,
                    self.invocations.get(&log.invocation_id),
                    Some(carrier),
                );
            }
            Some(Content::InvocationResponse(response)) => {
                if let Some(invocation) = self.invocations.remove(&response.invocation_id) {
                    let failed = response
                        .result
                        .as_ref()
                        .is_none_or(|result| result.status != 1);
                    let http = response
                        .return_value
                        .as_ref()
                        .and_then(|data| data.data.as_ref())
                        .filter(|data| matches!(data, Data::Http(_)))
                        .or_else(|| {
                            response.output_data.iter().find_map(|binding| {
                                data(binding).filter(|data| matches!(data, Data::Http(_)))
                            })
                        });
                    let status = match http {
                        Some(Data::Http(http)) if http.status_code.is_empty() => Some(200),
                        Some(Data::Http(http)) => match http.status_code.parse::<u16>() {
                            Ok(status) => Some(status),
                            Err(error) => {
                                eprintln!("Cannot record engine HTTP status in telemetry: {error}");
                                None
                            }
                        },
                        _ => None,
                    };
                    invocation.finish(failed, status);
                }
            }
            _ => {}
        }
        Ok(())
    }

    pub fn finish_pending(&mut self) {
        for (_, invocation) in self.invocations.drain() {
            invocation.finish(true, None);
        }
    }

    pub fn handle_engine_event(&mut self, event: &HashMap<String, String>) -> Result<()> {
        match event.get("event").map(String::as_str) {
            Some("httpRequest") => {}
            Some("clientSpan") => {
                // A malformed span report must never fail the worker.
                if let Err(error) = self.telemetry.record_client_span(event) {
                    eprintln!("Ignoring invalid client span from Node.js: {error}");
                }
                return Ok(());
            }
            _ => bail!("unknown private engine event"),
        }
        let id = event
            .get("invocationId")
            .context("engine HTTP event is missing invocation id")?;
        let method = event
            .get("httpMethod")
            .filter(|method| !method.is_empty())
            .context("engine HTTP event is missing method")?;
        if let Some(invocation) = self.invocations.get_mut(id) {
            invocation.update_http_method(method);
        }
        Ok(())
    }
}
