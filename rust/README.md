# Azure Functions Node.js worker: Rust transport migration

**Compatibility-first baseline, not a fully ported or production-certified worker.**
The executable and host gRPC transport are Rust. JavaScript execution still uses
the existing Node.js execution engine, without modifying customer applications.
Native tracing and log export use the
[Rust OpenTelemetry crate](opentelemetry/README.md) in this folder.

This replaces the previous standalone HTTP proof of concept. HTTP traffic now
enters the real Azure Functions host, which invokes this worker over the actual
language-worker gRPC protocol.

## Architecture and ownership

```text
Azure Functions host / Core Tools
        |
        | official FunctionRpc.EventStream (gRPC, protobuf)
        v
Rust worker
  host connection, StartStream, size limits, IPC backpressure,
  invocation correlation, shutdown orchestration, native telemetry
        |
        | framed protobuf IPC (+ Node active-context carrier for logs)
        v
Internal Node.js execution process
  unchanged existing worker event handlers and @azure/functions-core
  legacy/v4 loading, bindings, hooks, CJS/ESM, HTTP streaming proxy
        |
        v
Unchanged customer @azure/functions library and application code
```

`bridge/engine.cjs` initializes the existing worker with an IPC event stream
instead of its Node.js gRPC client. It reuses `setupEventStream`,
`setupCoreModule`, and their existing handlers, not a reduced imitation of the
library API. Rust generates protocol types from the **same authoritative proto
files** in the existing worker repository. Binary bindings and typed collections
are protobuf throughout, not lossy JSON representations.

The bridge installs only the Node.js OpenTelemetry API, async context manager,
and W3C propagator. It does **not** install a JavaScript telemetry SDK or exporter.
Span creation, sampling, log records, batching, and export run in Rust.

## Build (Windows PowerShell)

Prerequisites: Node.js 22/24 supported by the existing engine, npm, stable Rust,
MSVC C++ build tools/Windows SDK, and `protoc` on PATH (or set `PROTOC` to the
compiler executable). Core Tools v4 is needed for the real HTTP sample.

The Rust code lives in this repository's `rust/` folder, a Cargo workspace with
the worker and the `opentelemetry` crate. It uses the Node.js engine built from
the repository root (`..`) and generates protocol types from
`../azure-functions-language-worker-protobuf`. Run from the repository root:

```powershell
# Build the existing Node.js engine and fetch the protobuf schema (fresh checkouts: npm ci first).
npm run build

npm --prefix rust ci --ignore-scripts
npm --prefix rust\sample\hello-world ci --ignore-scripts
npm --prefix rust\sample\hello-world-configured ci --ignore-scripts
cargo build --locked --manifest-path rust\Cargo.toml
```

If Cargo is not on PATH, use `& "$env:USERPROFILE\.cargo\bin\cargo.exe"`.
The worker deliberately reuses the built execution engine and schema instead of
copying them. The samples and tests use the published `@azure/functions` package.

## Samples

Both samples live under `rust/sample` and run through the real Functions host.

| Sample | What it shows | Worker config |
| --- | --- | --- |
| `hello-world` | A single `hello` function. The customer changes nothing; OTel stays off. | `rust/runtime.json` (default) |
| `hello-world-configured` | The same app with customer opt-in: native OTel on, a custom service name, chosen instrumentations, and Node arguments. Adds `trace` and `failure` functions. | `sample/hello-world-configured/rust-worker.json` |

`start-http.ps1` uses a sample's `rust-worker.json` when it has one and the
default `runtime.json` otherwise. It points the host at the Rust executable,
uses local file secret storage, and restores process environment settings on
exit. No Azure resources, Azurite, or cloud credentials are needed because only
HTTP triggers are hosted.

### Hello World

```powershell
& rust\scripts\start-http.ps1 -Sample hello-world -Port 7075 -VerboseHost
```

`-VerboseHost` shows worker console output, including the `[Rust worker]`
startup lines that confirm the Rust executable is running. In another terminal:

```powershell
Invoke-RestMethod 'http://localhost:7075/api/hello?name=Rust'
```

### Customer-configured Hello World

```powershell
& rust\scripts\start-http.ps1 -Sample hello-world-configured -Port 7075
```

The customer owns `rust-worker.json`. In it they turn telemetry on, name the
service (`contoso-hello-world`), and pick instrumentations (`http` and `logs`
on, `functions` off). Spans and logs go to the `console` exporter, so they show
up in the host output. To send them to a collector instead, set `"exporter":
"otlp"` and `OTEL_EXPORTER_OTLP_ENDPOINT`. In a deployed app the same file is
selected with the `FUNCTIONS_RUST_WORKER_CONFIG` app setting.

```powershell
Invoke-RestMethod 'http://localhost:7075/api/hello?name=Rust'
Invoke-RestMethod 'http://localhost:7075/api/hello' -Method Post -Body 'Contoso'
Invoke-RestMethod 'http://localhost:7075/api/trace' -Headers @{
    traceparent = '00-12345678901234567890123456789012-1234567890123456-01'
    tracestate = 'vendor=value'
}
# Expected HTTP 500:
Invoke-WebRequest 'http://localhost:7075/api/failure'
```

Pass `-Streaming` to enable the library's existing HTTP streaming path. The
host still owns routes, HTTP auth levels, binding extensions, and function keys.
The samples use anonymous functions for local testing only.

## Instrumentation configuration

Native telemetry is **opt-in**: the shipped `runtime.json` sets
`telemetry.enabled` to `false`, so no spans or native logs are produced and the
host keeps its own logging. To turn it on, edit `runtime.json` and restart the worker:

```json
{
    "engine_directory": "..",
    "node_executable": "node",
    "node_arguments": [],
    "telemetry": {
        "enabled": true,
        "service_name": "azure-functions-rust-worker",
        "context_propagation": true,
        "instrumentations": {
            "http": true,
            "functions": true,
            "logs": true
        },
        "exporter": "console"
    }
}
```

- `http`: spans for HTTP invocations (including handler failures), not outbound
  Node.js `http`/`https`/`fetch` calls.
- `functions`: spans for non-HTTP invocations.
- `logs`: native export of worker/application RPC logs, with severity,
  `CategoryName`, and invocation/Node async context correlation. The host receives
  `WorkerOpenTelemetryEnabled=true` only when native log export is enabled, to
  avoid duplicate host telemetry.
- `context_propagation`: carry the host W3C trace into native spans and bind it
  to Node.js handlers. This works across `await`, concurrent requests, and ESM.
- `enabled: false`: bypass native telemetry and leave host trace context and
  baseline engine capabilities intact.
- `engine_directory` is relative to the runtime config file. To use another
  config, set `FUNCTIONS_RUST_WORKER_CONFIG` or pass `--rust-config`.
- `node_arguments` supports worker-owned Node.js options such as `--inspect`.
  The host's legacy and `functions-*` launch arguments are accepted; the latter
  remain authoritative, as in the existing worker.

Unknown config fields fail startup. For OTLP HTTP/protobuf, set `exporter` to
`otlp` and set `OTEL_EXPORTER_OTLP_ENDPOINT` to the collector base endpoint,
for example `http://127.0.0.1:4318`. Traces and logs use `/v1/traces` and
`/v1/logs`; signal-specific endpoints and OTLP authentication environment
variables are also supported by the native SDK. Do not store credentials in JSON.
Console telemetry uses Rust stdout; bridge/customer console diagnostics use stderr.

## Compatibility evidence

| Surface | Implementation / validation |
|---|---|
| Host initialization, indexing, capabilities, status | Existing handlers; real gRPC tests |
| v4 CommonJS and native ESM loading | Existing loader; real gRPC tests |
| Legacy v3 function loading/invocation | Existing legacy model; real gRPC tests |
| App start/pre/post/log/terminate hooks | Existing hook engine; real gRPC tests |
| Extra bindings, binary data, typed collections, retry context | Existing converters; representative real gRPC tests |
| HTTP bodies/responses, errors, route metadata | Existing library/host; gRPC tests and real Core Tools smoke |
| HTTP streaming proxy and `HttpUri` | Existing library proxy; real gRPC test |
| Specialization/environment reload | Existing handler; real gRPC test |
| Concurrent invocations / async context | Context bridge; real gRPC tests |
| Host message-size limits | Exact-limit request tested; private IPC allows bounded worker-added trace context overhead |
| Native span/log OTLP delivery | Rust SDK; local collector test |
| Graceful termination / fatal engine crash | Rust lifecycle and original terminate handler; gRPC tests |
| Debugger options, blocked-event-loop monitor, other extensions | Retained engine paths; not exhaustively certified through Rust |
| Shared-memory close, cancellation, load collections, heartbeat/file-change handling | Same no-op/unsupported behavior as current `setupEventStream`; no new support claimed |

The original worker suite passed **150 tests, with 8 pending**. That is regression
evidence for the reused execution engine, **not** proof that every original test
ran through the Rust transport. The separate gRPC compatibility suite exercises
the new process boundary. Full Azure extension/E2E parity certification remains
necessary before replacing a production worker.

```powershell
cargo test --locked --manifest-path rust\Cargo.toml --workspace
node --test rust\test\host.test.cjs
```

## Remaining migration work and performance

- JavaScript business logic, worker handlers, codecs in the execution engine,
  bindings, and the HTTP streaming proxy still execute in Node.js. This is **not**
  a claim that most application compute has moved to Rust, nor a full Rust port.
- No automatic outgoing HTTP/database/third-party instrumentation, native
  JavaScript span bridge, JavaScript SDK configuration API replacement, or
  Application Insights connection-string exporter is implemented. Existing
  customer-provided JavaScript SDK/exporters are not migrated automatically.
- Node environment specialization is forwarded unchanged. Native telemetry
  configuration/exporter environment is read at **Rust process startup**;
  changing OTLP settings only in an environment-reload message does not
  reconfigure the native SDK. Production specialization needs an explicit
  native telemetry reconfiguration contract.
- Streaming hosts omit some HTTP metadata from RPC. The worker bridge supplies
  the real request method from Node before invocation. Streaming HTTP status
  stays on the Node proxy response path and is not yet attached to native spans;
  RPC invocation failures still mark native spans as errors.
- TLS uses native trusted roots, but the TLS path and alternate-platform
  packaging have not been integration-certified here. The supplied host config
  and startup script target Windows/debug builds; production packaging must
  bundle the engine, native executable, schema/build outputs, and bridge dependencies.
- The engine is trusted application code, not a sandbox. Direct writes to its
  stdout corrupt IPC; normal console/context logging is redirected safely.
- A fatal IPC/engine/transport error terminates Rust with an error so the host
  can restart it; there is no success-shaped fallback or hidden switch to the
  old Node.js gRPC client. In-flight native spans are ended as failures and
  telemetry is flushed on controlled shutdown.

Rust can improve safety and control over transport/telemetry infrastructure.
It does not automatically make V8 faster. This baseline adds a process, IPC
serialization, and a native SDK, which can increase latency or memory. Benchmark
cold start, RSS, throughput, p50/p95/p99 latency, event-loop lag, and export
overhead against the original worker before claiming a benefit.
