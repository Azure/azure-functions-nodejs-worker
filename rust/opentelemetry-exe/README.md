# `azfunc-otel`: customer-installed OpenTelemetry sidecar (prototype)

This prototype adds opt-in OpenTelemetry for Azure Functions Node.js apps
**without changing the Node.js worker or the host**. The app takes a single
dependency, `@azure/functions-opentelemetry-native`. That package ships a small
Rust executable (`azfunc-otel`) that owns the OpenTelemetry SDK, batching,
retry, and exporters. Instrumentations are opt-in through an app setting or the
`enable()` options.

```text
Function app (standard Node.js worker)
  └─ @azure/functions-opentelemetry-native   (JS: hooks + http/dns/fetch/log observers)
        │  NDJSON records over stdin
        ▼
     azfunc-otel  (Rust, OpenTelemetry SDK 0.31)
        ├─ OTLP/HTTP ──► OpenTelemetry Collector ──► azuremonitorexporter ──► Application Insights   (default)
        ├─ Azure Monitor directly (optional `azure-monitor` Cargo feature)
        └─ console (local development)
```

## Why a Collector-first exporter

- There is **no official Rust Azure Monitor exporter**. The
  `azure_monitor_opentelemetry_exporter` crate is a 0.0.1 placeholder. The
  [Azure SDK for Rust logging guidance](https://learn.microsoft.com/azure/developer/rust/sdk/logging#export-telemetry-to-azure-monitor)
  recommends exporting OTLP to an OpenTelemetry Collector that runs the contrib
  `azuremonitorexporter`.
- Using the Collector means another team maintains the Azure Monitor mapping,
  and the sidecar keeps only the standard OTLP exporter.
- For environments without a Collector, the `azure-monitor` feature compiles in
  the community crate
  [`opentelemetry-application-insights`](https://crates.io/crates/opentelemetry-application-insights)
  0.44 (MIT, matches OpenTelemetry 0.31). It is off by default.

## Usage

```js
// First line of the app entry point, before functions are registered.
require('@azure/functions-opentelemetry-native').enable();
// Or: enable({ instrumentations: ['http', 'dns', 'fetch', 'logs'], serviceName: 'orders' })
```

Invocation (server) spans are always on once `enable()` is called. Everything
else is opt-in.

| Setting | Purpose |
| --- | --- |
| `OTEL_NODE_ENABLED_INSTRUMENTATIONS` | Comma-separated: `http`, `dns`, `fetch`, `logs`. Empty means invocation spans only. |
| `AZURE_FUNCTIONS_OTEL_EXPORTER` | `auto` (default), `otlp`, `azuremonitor`, `console`, or `none`. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Collector endpoint. Setting it makes `auto` choose OTLP. |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Used by `auto` and `azuremonitor` when the `azure-monitor` feature is built in. |
| `OTEL_SERVICE_NAME` | Service name. Falls back to `WEBSITE_SITE_NAME`, then `azure-functions-node`. |
| `OTEL_TRACES_SAMPLER` / `OTEL_TRACES_SAMPLER_ARG` | Standard samplers. Defaults to `parentbased_always_on`. |
| `AZURE_FUNCTIONS_OTEL_EXE` | Overrides the bundled executable path. |
| `AZURE_FUNCTIONS_OTEL_START_DELAY_MS` | Idle delay before the sidecar starts if no invocation has completed (default 1000). |

`auto` picks OTLP when an OTLP endpoint is set. Otherwise it picks Azure Monitor
when a connection string is set and the feature is compiled in. Otherwise it
falls back to console, with a warning if a connection string was ignored.

If the executable is missing or the sidecar exits, the app keeps running and
telemetry is disabled (fail open). The sidecar is `unref()`'d, so it never
keeps the worker alive. `appTerminate` flushes it, waiting up to 5 seconds.

## How it works

- `app.hook.preInvocation` reads the host's `traceparent`, makes the sampling
  decision, and creates the invocation span. It then runs the handler inside
  `AsyncLocalStorage` so client calls find their parent.
- `http` (the `http.client.*` diagnostics channels), `fetch`
  (`undici:request:*`), and `dns` (a wrapped `lookup`) record client spans and
  inject `traceparent` into outgoing requests. `url.full` drops user info and
  the fragment and keeps only query parameter names: every value becomes
  `REDACTED`. If a URL cannot be parsed, the query is removed.
- `app.hook.log` correlates `context.log` records with the active span.
- Node assigns trace and span IDs, because it has already propagated them
  downstream. The Rust SDK keeps those IDs (`SpanBuilder::with_span_id` and
  `with_trace_id`), attaches the remote parent, and exports.

Record protocol, one JSON object per line on stdin. Nanoseconds are strings
because JavaScript numbers lose precision:

```json
{"t":"span","name":"GET outbound","kind":"server","traceId":"…","spanId":"…","parentSpanId":"…","startNs":"…","endNs":"…","attributes":{}}
{"t":"log","timeNs":"…","severity":"information","body":"…","traceId":"…","spanId":"…","attributes":{}}
{"t":"flush"}
```

## Cold start

Spawning a process blocks the Node.js event loop. On Windows, measurements were
about 59 ms for the first spawn and about 25 ms warm, with the sidecar ready
after 56–94 ms. Linux is expected to be cheaper but has not been measured.

To keep that off the first request, `enable()` does **not** spawn. Records are
buffered (up to 10,000) and the sidecar starts on `setImmediate` after the first
invocation completes, or after the idle delay, whichever comes first. In the
sample, the sidecar started after the first invocation with 4 buffered records
and a 14 ms spawn. The JS package loads no OpenTelemetry modules at all.

## Build and test

```powershell
cargo test -p azure-functions-otel-exe
cargo test -p azure-functions-otel-exe --features azure-monitor
& rust\scripts\build-otel-exe.ps1               # OTLP + console, about 4.2 MB
& rust\scripts\build-otel-exe.ps1 -AzureMonitor # adds direct Azure Monitor, about 4.6 MB
```

The script copies the binary to `npm/bin/<platform>-<arch>/`. Build it before
running `npm install` in the sample, because `install-links=true` copies the
package. A published package would ship one binary per platform as optional
dependencies (for example `linux-x64` and `win32-x64`).

## Compared with the worker-native approach

| | Worker-native (`OTEL_WORKER_ENABLE`) | Customer exe (this package) |
| --- | --- | --- |
| Worker or host changes | Yes (Rust worker) | None |
| Customer action | App settings only | One npm dependency + `enable()` |
| OTel SDK location | Inside the worker | Sidecar process |
| Cold-start cost | None when disabled | Deferred spawn, about 25–60 ms off the first request |
| Version ownership | Platform | Customer chooses the package version |

## Not yet validated

- OTLP export reaches an OTLP/HTTP endpoint (protobuf `POST /v1/traces` and
  `/v1/logs` to a local listener were verified), but has not been tested
  against a real Collector with `azuremonitorexporter`. Direct Azure Monitor
  export at runtime is covered only by unit tests.
- Linux and macOS spawn costs, and packaging for each platform.
