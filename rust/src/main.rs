// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

mod protocol;

use anyhow::{bail, Context, Result};
use azure_functions_opentelemetry_rust::{Config as TelemetryConfig, Telemetry};
use bytes::Bytes;
use clap::Parser;
use futures_util::{SinkExt, StreamExt};
use prost::Message;
use protocol::{rpc, Protocol};
use rpc::{streaming_message::Content, StreamingMessage};
use serde::Deserialize;
use std::{collections::HashMap, path::PathBuf, process::Stdio, time::Duration};
use tokio::{process::Command, sync::mpsc, time::Instant};
use tokio_stream::wrappers::ReceiverStream;
use tokio_util::codec::LengthDelimitedCodec;
use tonic::transport::{ClientTlsConfig, Endpoint};

#[derive(Parser)]
struct Args {
    #[arg(long, value_parser = clap::builder::NonEmptyStringValueParser::new())]
    functions_uri: String,
    #[arg(long, value_parser = clap::builder::NonEmptyStringValueParser::new())]
    functions_worker_id: String,
    #[arg(long, value_parser = clap::builder::NonEmptyStringValueParser::new())]
    functions_request_id: String,
    #[arg(long, value_parser = clap::value_parser!(u32).range(1..))]
    functions_grpc_max_message_length: u32,
    #[arg(long, env = "FUNCTIONS_RUST_WORKER_CONFIG")]
    rust_config: Option<PathBuf>,
    // The host also supplies these legacy arguments alongside the authoritative functions-* values.
    #[arg(long = "host", hide = true)]
    _legacy_host: Option<String>,
    #[arg(long = "port", hide = true)]
    _legacy_port: Option<u16>,
    #[arg(long = "workerId", hide = true)]
    _legacy_worker_id: Option<String>,
    #[arg(long = "requestId", hide = true)]
    _legacy_request_id: Option<String>,
    #[arg(long = "grpcMaxMessageLength", hide = true)]
    _legacy_grpc_max_message_length: Option<u32>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Config {
    engine_directory: PathBuf,
    node_executable: PathBuf,
    node_arguments: Vec<String>,
    telemetry: TelemetryConfig,
}

fn endpoint(uri: &str) -> Result<Endpoint> {
    let uri = if uri.contains("://") {
        uri.to_owned()
    } else {
        format!("http://{uri}")
    };
    if !uri.starts_with("http://") && !uri.starts_with("https://") {
        bail!("functions-uri must use http:// or https://");
    }
    let mut endpoint = Endpoint::from_shared(uri.clone())?.connect_timeout(Duration::from_secs(30));
    if uri.starts_with("https://") {
        endpoint = endpoint.tls_config(ClientTlsConfig::new().with_native_roots())?;
    }
    Ok(endpoint)
}

async fn run(args: Args) -> Result<()> {
    let config_path = args
        .rust_config
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("runtime.json"));
    let config_path = config_path
        .canonicalize()
        .context("locating Rust worker runtime configuration")?;
    let config: Config = serde_json::from_slice(&std::fs::read(&config_path)?)?;
    let engine = dunce::canonicalize(
        config_path
            .parent()
            .context("missing config directory")?
            .join(config.engine_directory),
    )?;
    eprintln!(
        "LanguageWorkerConsoleLog[Rust worker] Azure Functions Node.js Rust worker v{} starting (pid={}, workerId={}, hostUri={}, config={})",
        env!("CARGO_PKG_VERSION"),
        std::process::id(),
        args.functions_worker_id,
        args.functions_uri,
        config_path.display()
    );
    if !engine
        .join("dist")
        .join("src")
        .join("setupEventStream.js")
        .is_file()
    {
        bail!(
            "Node execution engine is not built at {}; run npm run build in the existing worker",
            engine.display()
        );
    }
    let engine_display = engine.display().to_string();
    let (telemetry_config, warnings) = config
        .telemetry
        .with_app_settings(|name| std::env::var(name).ok());
    for warning in warnings {
        eprintln!("LanguageWorkerConsoleLog[Rust worker] Warning: {warning}");
    }
    let mut protocol = Protocol::new(Telemetry::new(telemetry_config)?);
    let clients = protocol
        .telemetry
        .client_instrumentations()
        .iter()
        .map(|kind| kind.as_str())
        .collect::<Vec<_>>()
        .join(",");
    eprintln!(
        "LanguageWorkerConsoleLog[Rust worker] OpenTelemetry: native={}, context={}, client instrumentations={}",
        protocol.telemetry.enabled(),
        protocol.telemetry.context_enabled(),
        if clients.is_empty() { "none" } else { &clients }
    );
    let limit = args.functions_grpc_max_message_length as usize;
    let mut child = Command::new(config.node_executable)
        .args(config.node_arguments)
        .arg(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("bridge")
                .join("engine.cjs"),
        )
        .arg(engine)
        .arg(&args.functions_worker_id)
        .arg(limit.to_string())
        .arg(protocol.telemetry.context_enabled().to_string())
        .arg(if clients.is_empty() { "none" } else { &clients })
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .kill_on_drop(true)
        .spawn()
        .context("starting Node execution engine")?;
    eprintln!(
        "LanguageWorkerConsoleLog[Rust worker] Started Node.js execution engine (node pid={}, engine={})",
        child.id().map_or_else(|| "unknown".to_owned(), |id| id.to_string()),
        engine_display
    );
    let mut input = LengthDelimitedCodec::builder()
        .max_frame_length(limit + 4096)
        .new_write(child.stdin.take().context("missing engine stdin")?);
    let mut output = LengthDelimitedCodec::builder()
        .max_frame_length(limit + 4100)
        .new_read(child.stdout.take().context("missing engine stdout")?);
    let (engine_tx, mut engine_rx) = mpsc::channel::<Bytes>(16);
    let mut writer = tokio::spawn(async move {
        while let Some(bytes) = engine_rx.recv().await {
            input
                .send(bytes)
                .await
                .context("writing engine IPC frame")?;
        }
        Ok::<(), anyhow::Error>(())
    });

    let outcome = async {
        let channel = endpoint(&args.functions_uri)?.connect().await.context("connecting to Functions host")?;
        let mut client = rpc::function_rpc_client::FunctionRpcClient::new(channel)
            .max_decoding_message_size(limit).max_encoding_message_size(limit);
        let (host_tx, host_rx) = mpsc::channel(32);
        host_tx.send(StreamingMessage {
            request_id: args.functions_request_id,
            content: Some(Content::StartStream(rpc::StartStream { worker_id: args.functions_worker_id })),
        }).await?;
        let mut host = client.event_stream(ReceiverStream::new(host_rx)).await?.into_inner();
        let mut pending = None;
        let mut closing = false;
        let mut deadline = Instant::now() + Duration::from_secs(86400);
        let shutdown = tokio::signal::ctrl_c();
        tokio::pin!(shutdown);
        eprintln!("LanguageWorkerConsoleLog[Rust worker] Rust gRPC transport connected; execution engine is Node.js (rust pid={})", std::process::id());
        loop {
            tokio::select! {
                permit = engine_tx.reserve(), if pending.is_some() => {
                    permit.context("engine input closed")?.send(pending.take().context("missing pending engine frame")?);
                }
                message = host.message(), if pending.is_none() && !closing => {
                    let message = message.context("reading Functions host event stream")?;
                    let mut message = match message {
                        Some(message) => message,
                        None => StreamingMessage { request_id: String::new(), content: Some(Content::WorkerTerminate(rpc::WorkerTerminate::default())) },
                    };
                    if let Some(Content::WorkerTerminate(terminate)) = &message.content {
                        closing = true;
                        let grace = terminate.grace_period.as_ref()
                            .and_then(|duration| Duration::try_from(*duration).ok())
                            .unwrap_or(Duration::from_secs(5));
                        deadline = Instant::now() + grace;
                    }
                    protocol.handle_host_message(&mut message)?;
                    pending = Some(Bytes::from(message.encode_to_vec()));
                }
                frame = output.next() => {
                    match frame {
                        Some(frame) => {
                            let frame = frame.context("reading engine IPC frame")?;
                            if frame.len() < 4 { bail!("truncated engine IPC envelope"); }
                            let metadata_length = u32::from_be_bytes(frame[..4].try_into()?) as usize;
                            if metadata_length > 4096 || metadata_length + 4 > frame.len() {
                                bail!("invalid engine IPC context envelope length");
                            }
                            let carrier: HashMap<String, String> = serde_json::from_slice(&frame[4..metadata_length + 4])?;
                            if frame.len() == metadata_length + 4 {
                                protocol.handle_engine_event(&carrier)?;
                                continue;
                            }
                            let mut message = StreamingMessage::decode(&frame[metadata_length + 4..])?;
                            protocol.handle_engine_message(&mut message, &carrier)?;
                            host_tx.send(message).await.context("writing Functions host event stream")?;
                        }
                        None => {
                            let status = tokio::time::timeout(Duration::from_secs(2), child.wait()).await
                                .context("engine closed stdout without exiting")??;
                            if !closing || !status.success() {
                                bail!("Node execution engine exited unexpectedly: {status}");
                            }
                            break;
                        }
                    }
                }
                result = &mut writer => {
                    result.context("engine writer task failed")??;
                    bail!("engine input unexpectedly closed");
                }
                signal = &mut shutdown, if !closing && pending.is_none() => {
                    signal.context("registering worker shutdown signal")?;
                    closing = true;
                    deadline = Instant::now() + Duration::from_secs(5);
                    pending = Some(Bytes::from(StreamingMessage {
                        request_id: String::new(),
                        content: Some(Content::WorkerTerminate(rpc::WorkerTerminate::default())),
                    }.encode_to_vec()));
                }
                _ = tokio::time::sleep_until(deadline), if closing => {
                    bail!("Node engine exceeded the worker termination grace period");
                }
            }
        }
        Ok::<(), anyhow::Error>(())
    }.await;
    writer.abort();
    if child.try_wait()?.is_none() {
        if let Err(error) = child.kill().await {
            eprintln!("Failed to stop Node execution engine: {error}");
        }
    }
    protocol.finish_pending();
    let telemetry = protocol.telemetry.shutdown();
    outcome?;
    telemetry?;
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_max_level(tracing_subscriber::filter::LevelFilter::WARN)
        .try_init()
        .map_err(|error| anyhow::anyhow!("initializing worker diagnostics: {error}"))?;
    run(Args::parse()).await
}
