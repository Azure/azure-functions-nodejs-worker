# Proposal: Rust-based Node.js worker with native, opt-in OpenTelemetry

| | |
|---|---|
| **Status** | In progress |
| **Area** | Azure Functions Node.js worker, Node.js OpenTelemetry instrumentation |
| **Goal** | Reduce Node.js cold start, make OpenTelemetry (OTel) opt-in and vendor-neutral |
| **Prototypes** | `azure-functions-nodejs-worker-Rust` and `azure-functions-nodejs-opentelemetry-Rust` (local prototypes, not yet published) |

## 1. Summary

We propose to:

1. **Move the host-facing worker infrastructure to Rust.** This covers the gRPC
   connection to the Functions host, the protocol handling, invocation
   correlation, backpressure, and shutdown. Customer JavaScript continues to run
   on Node.js through the existing execution engine and `@azure/functions`.
   Customers do not change their code.
2. **Move the OpenTelemetry pipeline to Rust.** This replaces
   `@azure/functions-opentelemetry-instrumentation` and the JavaScript OTel
   SDK/exporter stack. Span creation, sampling, log records, batching, and export
   happen in a native crate, outside the Node.js event loop.
3. **Make OTel and each instrumentation opt-in.** With no configuration, the
   worker loads **no** telemetry code. Customers enable OTel, and then individually
   enable instrumentations such as `http` (outgoing), `fetch`, and `dns`.
   We load only the instrumentation code they turn on.
4. **Make OTel platform-agnostic.** Export uses standard OTLP and W3C Trace
   Context, so customers can choose any OTel-compatible backend. One shared Rust
   implementation also aims for consistent behavior across supported OS,
   architecture, and hosting plan targets. Each target counts as supported only
   after it passes the build, extension/E2E parity, and benchmark validation in
   sections 8–10. Until then, cross-platform consistency is a goal, not a guarantee.

The main goal is to **reduce cold start**. Today, the telemetry setup and
automatic instrumentation load in Node.js on the startup path. This proposal
removes that work by default and moves the rest out of JavaScript.

## 2. Problem

### 2.1 Cold start cost of the current OTel setup

The current Node.js OTel setup runs inside the customer's Node.js process,
before the customer's functions can load:

- The customer's app must `require`/`import` the OTel JS SDK, tracer provider,
  exporters such as `@azure/monitor-opentelemetry-exporter`, and
  `@opentelemetry/instrumentation-http`. It must also load
  `@azure/functions-opentelemetry-instrumentation`.
  This can add many modules to load, parse, and compile on V8 during cold start.
- Instrumentation works by patching modules as they load
  (`@opentelemetry/instrumentation` hooks `require`, and ESM needs
  `--experimental-loader`/`--import`). These hooks affect **every**
  module the app loads, not only the instrumented modules.
- Span processing, serialization, and export run on the same event loop as the
  customer's handlers. This competes with the first invocations.
- HTTP instrumentation is effectively required. The README states that
  *"Azure Functions instrumentation expects HTTP layer to be instrumented"*.
  So customers pay for HTTP patching even when they only need invocation spans.

### 2.2 OTel is not opt-in or consistent

- Customers must configure the setup in each app, and CJS and ESM need
  different steps. Mistakes produce no traces or duplicate logs.
- The host already supports `telemetryMode: "OpenTelemetry"` in `host.json`
  (`ScriptJobHostOptions.TelemetryMode`), and the `WorkerOpenTelemetryEnabled`
  worker capability. However, the Node.js side has no single,
  worker-owned switch that matches them.
- Examples and defaults lean toward the Azure Monitor exporter. They do not
  promote a vendor-neutral OTLP path.

## 3. Goals and non-goals

### Goals

- **G1. Cold start:** If telemetry is off (the default), the startup path loads no
  OTel code. If telemetry is on, the startup work in Node.js is much smaller
  than it is today.
- **G2. Opt-in:** OTel is off by default. Each instrumentation is separately opt-in,
  and we load only enabled instrumentations.
- **G3. Platform-agnostic:** Use OTLP and W3C Trace Context with any compatible
  backend. Aim for consistent behavior on each target we choose to support.
  Candidate targets are Windows/Linux, x64/arm64, Consumption, Flex Consumption,
  Premium, Dedicated, containers, and local Core Tools. A target counts as
  supported only after it passes the validation in sections 8–10.
- **G4. Zero app changes:** Existing v3 and v4, CJS and ESM apps run without changes.
- **G5. Correctness:** Spans have the host trace as their parent, logs correlate
  with traces, and the host does not emit duplicate logs.

### Non-goals

- Running customer JavaScript in Rust, or replacing V8/Node.js.
- Rewriting `@azure/functions`, bindings, or the HTTP streaming proxy in Rust
  during this phase.
- Supporting every npm OTel instrumentation. Customers who need the full
  JS ecosystem can still use their own JS SDK, as described in section 7.
- Producing metrics in the first phase, which matches the current instrumentation package.

## 4. Proposed architecture

```text
Azure Functions host
        |  FunctionRpc.EventStream (gRPC/protobuf)
        v
Rust worker (native executable)
  - host connection, StartStream, WorkerInit, capabilities
  - invocation correlation, size limits, backpressure, shutdown
  - [opt-in] native OTel SDK: spans, logs, sampling, batching, OTLP export
        |  framed protobuf IPC (+ trace-context carrier)
        v
Node.js execution engine (existing handlers + @azure/functions)
  - customer code, bindings, hooks, CJS/ESM, HTTP streaming
  - [opt-in only] OTel API + async context manager (no JS SDK/exporter)
  - [opt-in only] selected lightweight instrumentation hooks (http, fetch, dns, ...)
        |
        v
Customer application (unchanged)
```

Key design points:

- **Native transport.** Rust owns the gRPC protocol to the host. Node.js no
  longer loads `@grpc/grpc-js` or the protobuf runtime, or creates the gRPC
  channel. Rust generates its protocol types from the same proto files as the
  existing worker, so they cannot drift.
- **Native telemetry.** The `azure-functions-nodejs-opentelemetry-Rust` crate
  provides tracing, logging, sampling, batching, and OTLP export. Export runs on
  Rust threads, not on the Node.js event loop.
- **Minimal Node.js footprint.** When OTel is enabled, Node.js loads only the
  OTel **API**, the async context manager, and the W3C propagator, so customer
  code sees the correct active context. It does not load a JS SDK or exporter.
- **Worker-owned enablement.** The worker installs the context hook before the
  app loads. Customers no longer need to patch `require` themselves or add an ESM
  `--import`/loader step.

## 5. Opt-in model

### 5.1 Default: OTel off

If the customer does not configure OTel:

- No OTel modules load in Node.js, no hooks are installed, and no exporter starts.
- The worker keeps propagating the host's W3C trace context in the invocation
  context, so downstream correlation still works.
- The worker does not set `WorkerOpenTelemetryEnabled`, so host logging
  behavior stays unchanged.

### 5.2 Enabling OTel

OTel turns on when **either** of these is true:

- `host.json` sets `"telemetryMode": "OpenTelemetry"`. This is the existing
  host switch and should be the primary path.
- An explicit worker setting enables it. The final name needs review. Example:
  `FUNCTIONS_NODE_OTEL_ENABLED=true`.

When OTel is on, the worker reports `WorkerOpenTelemetryEnabled=true` only if
native log export is enabled. The host then filters `Function.*` logs to avoid
duplicates, which the host already does today.

### 5.3 Per-instrumentation opt-in

Each instrumentation is independent and off unless the customer enables it. We
load its code only after it is enabled.

| Instrumentation | Scope | Implementation | Default when OTel on |
|---|---|---|---|
| `invocation` | Server/internal span per function invocation, parented on host trace | Rust (no JS code) | On |
| `logs` | Worker and `context.log` logs, with severity mapping and trace correlation | Rust | On |
| `http` | Outgoing `http`/`https` client calls | Lazy JS hook (prefer `diagnostics_channel`), span data to Rust over IPC | Off |
| `fetch` | Outgoing `fetch`/undici calls | Lazy JS hook via undici diagnostics channels | Off |
| `dns` | `dns.lookup`/resolve calls | Lazy JS wrapper | Off |
| *(future)* `azure-sdk`, databases, etc. | Additional dependencies | Same lazy, opt-in pattern | Off |

Proposed configuration. We should finalize the exact keys during review, then
map them to app settings for portal and IaC use:

```json
{
  "version": "2.0",
  "telemetryMode": "OpenTelemetry",
  "openTelemetry": {
    "node": {
      "instrumentations": {
        "invocation": true,
        "logs": true,
        "http": true,
        "fetch": false,
        "dns": false
      }
    }
  }
}
```

Equivalent app setting form:
`FUNCTIONS_NODE_OTEL_INSTRUMENTATIONS=invocation,logs,http`.

Design rules:

- **Pay only for what you enable.** A disabled instrumentation adds no
  `require`, hook, or patch.
- **Prefer `diagnostics_channel` over monkey-patching.** It is stable,
  lower-cost, and does not require rewriting how modules load.
- **JS hooks record, Rust processes.** The JS hooks only capture timing and
  attributes, then send them to Rust over the existing IPC. Rust builds the
  spans, samples them, and exports them.
- **Respect sampling early.** If the parent trace is unsampled, hooks skip
  recording data.

## 6. Platform-agnostic OTel

- **Vendor-neutral export:** The default exporter is OTLP (HTTP/protobuf). The
  standard `OTEL_EXPORTER_OTLP_*` environment variables configure the endpoint,
  headers, and timeouts. This works with any OTel-compatible collector or
  backend, such as an OTel Collector, Azure Monitor via OTLP, Grafana, Datadog,
  Honeycomb, Jaeger, or Elastic.
- **Standard context:** Use W3C `traceparent`/`tracestate` end-to-end, and follow OTel
  semantic conventions (`faas.*`, `http.*`, `dns.*`, `server.*`).
- **Consistent behavior across supported targets (goal):** The same Rust crate
  handles telemetry on every target, so behavior should no longer depend on
  which JS packages, versions, or loader flags the app uses. This is a design
  goal, not a proven result. OTLP makes the choice of backend portable, but it
  does not guarantee runtime or hosting-plan parity. The prototype has not been
  certified on every OS, architecture, hosting plan, or extension combination.
  Each target must pass its own platform build, the full extension/E2E parity
  suite, and the section 8 benchmarks before we call it supported.
- **Azure Monitor:** Azure Monitor support should use OTLP or the host's existing
  Azure Monitor exporter path. It should not require a Node-only exporter in the
  customer's app.
- **Standard resource attributes:** Use `service.name`, `faas.instance`,
  `cloud.*`, and other standard resource attributes. The host already adds
  `faas.instance` when `telemetryMode` is OpenTelemetry.

## 7. Compatibility and migration

| Customer scenario | Behavior |
|---|---|
| No telemetry configured | No change. Cold start should improve because the gRPC client and protobuf runtime no longer load in Node.js |
| Uses `@azure/functions-opentelemetry-instrumentation` today | Phase 1: keep working. Docs recommend switching to `telemetryMode: OpenTelemetry`. Later: deprecate the package and log a warning |
| Brings their own full JS OTel SDK (custom instrumentations) | Supported. The worker propagates context and does not double-instrument. Customers keep their native OTel settings disabled |
| Uses Application Insights SDK | Unchanged. Its existing behavior is outside this proposal |

The worker must detect when the customer registered their own JS tracer
provider. In that case, it should not register a competing provider or emit
duplicate spans.

## 8. Cold start hypothesis and validation

> **Important:** The current prototype has **no** cold start data yet. It also
> adds a process boundary and IPC serialization, which could increase latency or
> memory if we do not optimize them. We must treat the cold start benefit as a
> hypothesis and prove it with measurements before rollout.

Expected sources of improvement:

1. Telemetry is off by default, so the startup path loads no OTel code.
2. When telemetry is on, Node.js loads no JS SDK or exporter and does not patch
   module loading for every module.
3. Instrumentations load lazily and only when the customer enables them.
4. Node.js does not load or initialize `@grpc/grpc-js` or the protobuf runtime.
5. Rust connects to the host and completes the handshake while Node.js is
   still booting, so those steps can happen in parallel.
6. Export happens off the event loop, so the first invocations do not compete
   with telemetry work.

Potential regressions to mitigate:

- Starting an extra process. Mitigations include spawning Node.js immediately,
  sharing work with placeholder warmup, and exploring an in-process option
  through a N-API addon.
- IPC serialization costs on each invocation.
- Extra memory for the native SDK.

**Benchmark matrix:** Compare the current worker with and without the JS OTel
SDK against the Rust worker with OTel off, OTel on, and OTel on with `http`.
Run on Windows and Linux, on Flex Consumption and Consumption, with
placeholder/specialization and without it. Test a small HTTP app, a
dependency-heavy app, and an ESM app.

**Metrics:** Cold start p50/p95/p99, host-measured time from specialization to
the first successful invocation, worker RSS, warm-path p50/p99 latency,
throughput, event-loop lag, and export overhead.

**Go/no-go gates for this proposal** (values to confirm with the team):

- Rust worker with OTel off: cold start must be **no worse** than the current
  worker. Target: a measurable improvement.
- Rust worker with OTel on: cold start must be **significantly better** than
  the current worker plus the JS OTel SDK. Target: at least 30% lower p95.
- Warm-path p99 latency and RSS must stay within agreed limits of the current
  worker.

## 9. Current prototype status

These prototypes already exist:

- **Rust worker:** Rust handles gRPC to the host and uses the existing Node.js
  execution engine over protobuf IPC. Real gRPC tests cover v3/v4, CJS/ESM,
  hooks, bindings, HTTP streaming, specialization, concurrency, and shutdown.
  We have also smoke-tested real HTTP functions through Core Tools.
- **Rust OTel crate:** It provides traces and logs, parent-based sampling,
  invocation spans, log severity mapping and correlation, and console/OTLP
  exporters. It also sets `WorkerOpenTelemetryEnabled` correctly.

Gaps to close before this is production-ready:

- Outgoing `http`/`fetch`/`dns` instrumentations. These are the opt-in hooks
  described in section 5.3. They do not exist yet.
- `host.json`/`telemetryMode` and app setting configuration. The prototype
  currently uses `runtime.json`.
- Reconfiguring native telemetry during specialization (environment reload).
  Today, the native SDK reads OTLP settings only when the Rust process starts.
- Streaming HTTP response status on spans.
- Builds for multiple platforms (win/linux/osx on x64/arm64), signing, and
  bundling into the worker package.
- Full extension/E2E parity testing and the cold start benchmarks in section 8.

## 10. Rollout plan

| Phase | Deliverable | Exit criteria |
|---|---|---|
| 0. Measure | Baseline and prototype benchmarks (section 8) | Go/no-go gates met |
| 1. Preview | Rust worker behind an opt-in app setting. Native OTel with `invocation` + `logs` | E2E parity suite green on all platforms |
| 2. Instrumentations | Opt-in `http`, `fetch`, `dns` hooks; `telemetryMode` integration; specialization reconfiguration | Semantic-convention tests; no duplicate telemetry |
| 3. Default worker | Ship the Rust worker as the default for supported Node.js versions, and keep the existing worker available as a fallback | Production telemetry shows cold start/stability equal or better |
| 4. Deprecate | Deprecate `@azure/functions-opentelemetry-instrumentation` with a migration guide | Adoption threshold met |

## 11. Risks

| Risk | Mitigation |
|---|---|
| Extra process/IPC offsets the cold start gains | Benchmark gates; parallel startup; evaluate an in-process N-API addon |
| Behavior differences vs. the current worker | Reuse the existing execution engine; run the existing worker test suite plus a gRPC parity suite |
| Native binary packaging and supply chain | Build and sign through the official pipeline; generate SBOMs; pin dependencies with `--locked` |
| Customer stdout writes corrupting IPC | Already handled by redirecting console output. Move IPC off stdio to a dedicated pipe |
| Double instrumentation with a customer JS SDK | Detect existing providers; clear documentation |
| Smaller instrumentation catalog than JS ecosystem | Customers can still bring their own SDK; add instrumentations by demand |
| Behavior differs by OS, architecture, hosting plan, or extension | Publish an explicit support matrix. Each target must pass its platform build, extension/E2E parity, and benchmarks before support is announced |

## 12. Open questions

1. Final configuration surface: should we use `host.json` `openTelemetry.node`
   or app settings? What precedence should apply when both exist?
2. Should `invocation` and `logs` default to on whenever
   `telemetryMode: OpenTelemetry` is set?
3. Should we use an out-of-process Node.js engine (the current prototype) or an
   in-process N-API addon in the long term?
4. Which instrumentations should ship after `http`/`fetch`/`dns`, such as Azure SDK, `pg`, `mongodb`, or `redis`?
5. What is the deprecation timeline for `@azure/functions-opentelemetry-instrumentation`?
6. Should we add metrics in phase 2 or treat them as a separate proposal?
