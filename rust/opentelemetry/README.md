# Azure Functions OpenTelemetry in Rust

Native telemetry crate for the
[compatibility-first Rust worker](../README.md).
This is not a Rust rewrite of Node.js or a drop-in npm package.

## What is native

- OpenTelemetry trace and log SDKs, service resources, parent-based sampling,
  span creation/completion, log severity mapping, batching, and export.
- Console and OTLP HTTP/protobuf exporters, including native TLS roots.
- W3C traceparent/tracestate extraction/injection.
- HTTP invocation SERVER spans and non-HTTP invocation INTERNAL spans.
- Correlated application/worker RPC logs with `CategoryName` and Node active
  trace/span IDs, including async logs arriving after an invocation ends.
- Error status for failed invocations and 5xx HTTP responses; in-flight spans
  are failed when the execution engine/transport exits unexpectedly.

HTTP status attributes are available on buffered RPC HTTP responses. The
streaming proxy's response status is not yet bridged into native spans; the
worker does bridge the real streaming request method before handler execution.

No request bodies, response bodies, query strings, or arbitrary request headers
are recorded by this crate. Log **bodies** are application/worker messages and
can contain whatever the application logs; configure downstream redaction as
appropriate.

## Relationship to the current Node.js instrumentation

The existing instrumentation package binds the host trace context to the
function handler, forwards logs (including level mapping), toggles the host
`WorkerOpenTelemetryEnabled` capability, and supports CJS and ESM module paths.

The new worker provides the same responsibilities through worker-owned
injection rather than customer-side module patching:

| Existing responsibility | New implementation |
|---|---|
| CJS require patch / ESM `registerAzFunc` | Worker installs the context hook before app loading; both entrypoint forms tested |
| Host W3C context on function callback | Rust carrier plus Node API/AsyncLocalStorage context binding |
| Log records / severity mapping | Rust log SDK; trace/debug/info/warn/error/fatal mappings tested |
| Category attributes | Native `CategoryName` for both CJS and ESM |
| Avoid duplicated host logs | Rust sets capability on init and environment reload only when native logs are enabled |
| Enable/disable configuration | Worker JSON config, applied on restart; not the old JavaScript `enable()/disable()` API |
| Unpatch/disposal | Execution process/SDK shutdown; no customer module patches to undo |

The minimal Node.js context hook and active-context carrier remain JavaScript:
Rust cannot reach Node.js async-local state or monkey-patch JavaScript modules
without a runtime bridge. The Node side uses only the OpenTelemetry **API,
context manager, and propagator**, not a JS telemetry SDK/exporter.

## Configuration and export

The embedding worker supplies a strict `Config`:

```json
{
    "enabled": true,
    "service_name": "azure-functions-rust-worker",
    "context_propagation": true,
    "instrumentations": {
        "http": true,
        "functions": true,
        "logs": true
    },
    "exporter": "otlp"
}
```

`http` controls **incoming function invocations**, not outgoing Node.js HTTP/fetch.
The host's trace is the parent of the native invocation span, and the resulting
context is passed to the Node.js handler. Unsampled parents remain unsampled.
No spans/logs are exported when `enabled` is false. If a particular invocation
instrumentation is disabled, existing valid context can still propagate.

For a local collector:

```powershell
$env:OTEL_EXPORTER_OTLP_ENDPOINT = 'http://127.0.0.1:4318'
# Optional signal-specific endpoints:
# $env:OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = 'http://127.0.0.1:4318/v1/traces'
# $env:OTEL_EXPORTER_OTLP_LOGS_ENDPOINT = 'http://127.0.0.1:4318/v1/logs'
```

Native SDK resource/exporter/batch environment settings are read at startup.
The explicit JSON `service_name` is the configured service identity.
Authentication headers belong in environment variables, not source/config files.
The OTLP exporter batches records; console export is synchronous for inspection.
The embedding worker enables diagnostics so exporter errors are visible without
turning a successful application invocation into a failure.

## Validation and boundaries

```powershell
cargo test --locked --manifest-path rust\Cargo.toml -p azure-functions-opentelemetry-rust
```

Native tests cover span kind, host parent correlation, error status, log/trace
correlation, late async log carriers, every worker severity mapping, disabled
telemetry, and unsampled parents. The worker's separate gRPC suite validates
CJS/ESM async context, capabilities, concurrent invocations, and actual native
OTLP trace/log delivery to a local collector.

This does not implement a replacement JavaScript `InstrumentationBase` API,
arbitrary npm instrumentations, an outbound HTTP/fetch hook, a JS span exporter
bridge, Azure Monitor connection-string handling, or live JS `setConfig`/
enable/disable calls. It does not emit metrics, just as the current
Functions-specific instrumentation does not itself produce metrics.
Full application ecosystem compatibility and performance remain to be certified;
do not infer them from these targeted tests.
