# Proposal: One OpenTelemetry for All, Exploring Rust to Reduce Cold Starts

| | |
|---|---|
| **Status** | In progress |
| **Area** | Azure Functions Node.js worker, Node.js OpenTelemetry instrumentation |
| **Goal** | Reduce Node.js cold start and make OpenTelemetry (OTel) opt-in and vendor-neutral |
| **Prototypes** | [`rust/`](../../rust/README.md) (Rust worker) and [`rust/opentelemetry`](../../rust/opentelemetry/README.md) (Rust OTel crate) in this repository |

## 1. Summary

Node.js apps pay for telemetry before their first function runs. We want to stop that.

The plan has five parts:

1. **Move the worker's host-facing code to Rust.** Rust takes over the gRPC
   connection to the Functions host, protocol handling, invocation correlation,
   backpressure and shutdown. Customer JavaScript still runs on Node.js through
   the existing execution engine and `@azure/functions`. Nobody changes their code.
2. **Move the OTel pipeline to Rust.** A native crate creates spans, samples
   them, records logs, batches and exports. All of it runs outside the Node.js
   event loop. This replaces `@azure/functions-opentelemetry-instrumentation`
   and the JavaScript OTel SDK and exporters.
3. **Ask the OpenTelemetry team to own the Rust OTel package.** We need them to
   build, publish and maintain it, with an opt-in switch for OTel and for each
   instrumentation. The same library can serve Node.js, Python (which already
   has a Rust worker), Go and Rust. Section 10 lists what we need from them.
4. **Make OTel and every instrumentation opt-in.** With no configuration, the
   worker loads no telemetry code at all. Customers turn OTel on, then pick the
   instrumentations they want, such as outgoing `http`, `fetch` and `dns`.
   Anything they leave off never loads.
5. **Make OTel platform-agnostic.** Export uses OTLP and W3C Trace Context, so
   customers can send data to any OTel-compatible backend. One Rust
   implementation should behave the same on every target we support. We'll call
   a target supported only after it passes the build, extension/E2E parity and
   benchmark checks in sections 8 to 11. Until then, consistent behavior across
   platforms is a goal.

The point of all this is **cold start**. Today the telemetry setup and automatic
instrumentation load in Node.js on the startup path. We'd drop that work by
default and move the rest out of JavaScript.

## 2. Problem

### 2.1 What the current OTel setup costs at cold start

The Node.js OTel setup runs inside the customer's process, before their
functions load.

- The app has to `require` or `import` the OTel JS SDK, a tracer provider,
  exporters such as `@azure/monitor-opentelemetry-exporter`,
  `@opentelemetry/instrumentation-http` and
  `@azure/functions-opentelemetry-instrumentation`. V8 has to load, parse and
  compile every one of those modules during cold start.
- Instrumentation patches modules as they load. `@opentelemetry/instrumentation`
  hooks `require`, and ESM needs `--experimental-loader` or `--import`. Those
  hooks run for **every** module the app loads, including ones nobody instruments.
- Span processing, serialization and export share the event loop with the
  customer's handlers. The first invocations have to compete with them.
- HTTP instrumentation is effectively mandatory. The package README says *"Azure
  Functions instrumentation expects HTTP layer to be instrumented"*. Customers
  who only want invocation spans still pay for HTTP patching.

### 2.2 OTel isn't opt-in, and setup varies

- Each app needs its own setup, and CJS and ESM apps need different steps. Get
  it wrong and you see no traces, or duplicate logs.
- The host already has `telemetryMode: "OpenTelemetry"` in `host.json`
  (`ScriptJobHostOptions.TelemetryMode`) and the `WorkerOpenTelemetryEnabled`
  worker capability. Node.js has no single worker-owned switch to match them.
- Examples and defaults point to the Azure Monitor exporter. Customers rarely
  see the vendor-neutral OTLP path.

## 3. Goals and non-goals

### Goals

- **G1. Cold start.** With telemetry off, which is the default, the startup path
  loads no OTel code. With telemetry on, Node.js does far less startup work than
  it does today.
- **G2. Opt-in.** OTel is off by default. Each instrumentation has its own
  switch, and only enabled instrumentations load.
- **G3. Platform-agnostic.** OTLP and W3C Trace Context work with any compatible
  backend. Each supported target should behave the same. Candidate targets are
  Windows and Linux, x64 and arm64, Consumption, Flex Consumption, Premium,
  Dedicated, containers and local Core Tools. A target is supported once it
  passes the checks in sections 8 to 11.
- **G4. No app changes.** Existing v3 and v4 apps, CJS or ESM, run as they are.
- **G5. Correct correlation.** Function spans use the host trace as their parent,
  logs link to traces, and the host emits no duplicate logs.

### Non-goals

- Running customer JavaScript in Rust, or replacing V8 or Node.js.
- Rewriting `@azure/functions`, bindings or the HTTP streaming proxy in Rust
  during this phase.
- Matching every npm OTel instrumentation. Customers who need the full JS
  ecosystem can keep their own JS SDK (section 7).
- Metrics in the first phase. The current instrumentation package doesn't
  produce them either.

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

How the pieces fit:

- **Native transport.** Rust owns the gRPC protocol to the host. Node.js stops
  loading `@grpc/grpc-js` and the protobuf runtime, and never opens a gRPC
  channel. Rust generates its protocol types from the same proto files as the
  existing worker, so the two can't drift apart.
- **Native telemetry.** The `rust/opentelemetry` crate
  handles tracing, logging, sampling, batching and OTLP export on Rust threads.
  None of it touches the Node.js event loop.
- **A small Node.js footprint.** With OTel on, Node.js loads three things: the
  OTel **API**, the async context manager and the W3C propagator. That's enough
  for customer code to see the right active context. No JS SDK, no exporter.
- **The worker turns OTel on.** It installs the context hook before the app
  loads. Customers stop patching `require` themselves and drop the ESM
  `--import` or loader step.

## 5. Opt-in model

### 5.1 Default: OTel off

Without any OTel configuration:

- No OTel modules load in Node.js. No hooks, no exporter.
- The worker still passes the host's W3C trace context into the invocation
  context, so downstream services can still correlate.
- The worker leaves `WorkerOpenTelemetryEnabled` unset. Host logging works as it
  does today.

### 5.2 Turning OTel on

OTel turns on when **either** of these is true.

- `host.json` sets `"telemetryMode": "OpenTelemetry"`. That's the existing host
  switch, and it should be the main path.
- A worker setting enables it. The prototype uses `OTEL_WORKER_DEFAULT=true`.
  The final name is still up for review.

The worker reports `WorkerOpenTelemetryEnabled=true` only when native log export
is on. The host then filters `Function.*` logs to avoid duplicates. It already
does this.

### 5.3 One switch per instrumentation

Every instrumentation stays off until the customer enables it, and its code
loads only after that.

| Instrumentation | Scope | Implementation | Default when OTel on |
|---|---|---|---|
| `invocation` | Server/internal span per function invocation, parented on host trace | Rust (no JS code) | On |
| `logs` | Worker and `context.log` logs, with severity mapping and trace correlation | Rust | On |
| `http` | Outgoing `http`/`https` client calls | Lazy JS hook (prefer `diagnostics_channel`), span data sent to Rust over IPC | Off |
| `fetch` | Outgoing `fetch`/undici calls | Lazy JS hook through undici diagnostics channels | Off |
| `dns` | `dns.lookup`/resolve calls | Lazy JS wrapper | Off |
| *(future)* `azure-sdk`, databases, etc. | Additional dependencies | Same lazy, opt-in pattern | Off |

A starting point for configuration. We'll settle the exact keys in review, then
map them to app settings for the portal and IaC:

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

The app setting version would be
`FUNCTIONS_NODE_OTEL_INSTRUMENTATIONS=invocation,logs,http`. The prototype
already does this with two settings: `OTEL_WORKER_DEFAULT=true` turns on
invocation spans and logs, and `OTEL_WORKER_ENABLE=http,dns,fetch` opts in to
client calls.

Rules we'll hold to:

- **You pay only for what you turn on.** A disabled instrumentation adds no
  `require`, hook or patch.
- **`diagnostics_channel` before monkey-patching.** It's stable, cheaper and
  leaves module loading alone.
- **JS records, Rust processes.** JS hooks capture timing and attributes and send
  them to Rust over the existing IPC. Rust builds, samples and exports the spans.
- **Check sampling first.** If the parent trace isn't sampled, the hooks skip
  recording.

## 6. Platform-agnostic OTel

- **Vendor-neutral export.** OTLP over HTTP/protobuf is the default exporter.
  The standard `OTEL_EXPORTER_OTLP_*` environment variables set the endpoint,
  headers and timeouts. Any OTel-compatible collector or backend works, such as
  an OTel Collector, Azure Monitor through OTLP, Grafana, Datadog, Honeycomb,
  Jaeger or Elastic.
- **Standard context.** W3C `traceparent` and `tracestate` end to end, plus the
  OTel semantic conventions (`faas.*`, `http.*`, `dns.*`, `server.*`).
- **Consistent behavior on supported targets.** One Rust crate handles telemetry
  everywhere, so results shouldn't depend on which JS packages, versions or
  loader flags an app uses. That's the design intent, and we haven't proven it
  yet. OTLP lets customers switch backends. It doesn't make every runtime or
  hosting plan behave the same. We haven't tested the prototype on every OS,
  architecture, hosting plan and extension combination. Each target needs its
  own platform build, a passing extension/E2E parity suite and the section 8
  benchmarks before we call it supported.
- **Azure Monitor.** Use OTLP or the host's existing Azure Monitor exporter. The
  customer's app shouldn't need a Node-only exporter.
- **Standard resource attributes.** `service.name`, `faas.instance`, `cloud.*`
  and the other standard attributes. The host already adds `faas.instance` when
  `telemetryMode` is OpenTelemetry.

## 7. Compatibility and migration

| Customer scenario | Behavior |
|---|---|
| No telemetry configured | No change. Cold start should improve, since Node.js no longer loads the gRPC client or protobuf runtime |
| Uses `@azure/functions-opentelemetry-instrumentation` today | Phase 1 keeps it working, and docs recommend moving to `telemetryMode: OpenTelemetry`. Later we deprecate the package and log a warning |
| Brings their own full JS OTel SDK (custom instrumentations) | Supported. The worker propagates context and doesn't instrument twice. Customers leave the native OTel settings off |
| Uses Application Insights SDK | Unchanged. This proposal doesn't touch it |

If a customer registers their own JS tracer provider, the worker has to notice.
It then skips registering a second provider and emits no duplicate spans.

## 8. Cold start: hypothesis and validation

> **Important:** We have **no** cold start data for the prototype yet. It also
> adds a process boundary and IPC serialization, and both could cost latency or
> memory if we don't tune them. Until measurements say otherwise, the cold start
> win is a hypothesis.

Where we expect the gains to come from:

1. Telemetry is off by default, so startup loads no OTel code.
2. With telemetry on, Node.js skips the JS SDK and exporter and doesn't patch
   every module as it loads.
3. Instrumentations load lazily, and only when enabled.
4. Node.js never loads or initializes `@grpc/grpc-js` or the protobuf runtime.
5. Rust connects to the host and finishes the handshake while Node.js is still
   booting. The two run in parallel.
6. Export happens off the event loop, so early invocations don't wait on
   telemetry.

What could make it worse:

- Starting an extra process. We can spawn Node.js immediately, share work with
  placeholder warmup, or try an in-process N-API addon.
- IPC serialization on every invocation.
- Extra memory for the native SDK.

**Benchmark matrix.** Compare the current worker, with and without the JS OTel
SDK, against the Rust worker with OTel off, OTel on, and OTel on with `http`.
Run on Windows and Linux, on Flex Consumption and Consumption, with and without
placeholder specialization. Use a small HTTP app, a dependency-heavy app and an
ESM app.

**Metrics.** Cold start p50/p95/p99, host-measured time from specialization to
the first successful invocation, worker RSS, warm-path p50/p99 latency,
throughput, event-loop lag and export overhead.

**Go/no-go gates** (values to confirm with the team):

- Rust worker with OTel off: cold start must be **no worse** than the current
  worker. We're aiming for a measurable improvement.
- Rust worker with OTel on: cold start must be **clearly better** than the
  current worker plus the JS OTel SDK. Target: at least 30% lower p95.
- Warm-path p99 latency and RSS must stay within agreed limits of the current
  worker.

## 9. Where the prototypes stand

Two prototypes exist today.

- **Rust worker.** Rust talks gRPC to the host and drives the existing Node.js
  execution engine over protobuf IPC. Real gRPC tests cover v3 and v4, CJS and
  ESM, hooks, bindings, HTTP streaming, specialization, concurrency and
  shutdown. We've also run real HTTP functions through Core Tools.
- **Rust OTel crate.** Traces and logs, parent-based sampling, invocation spans,
  log severity mapping and correlation, plus console and OTLP exporters. It sets
  `WorkerOpenTelemetryEnabled` correctly.
- **Opt-in client instrumentation.** `OTEL_WORKER_DEFAULT=true` with
  `OTEL_WORKER_ENABLE=http,dns,fetch` turns on outgoing `http`, `fetch` and `dns`
  spans with no OTel packages in the app. The hooks load only when listed. They
  use `diagnostics_channel` for `http` and `fetch`, inject `traceparent`, and
  send timing to Rust, which builds and exports the `Client` spans. We've run this
  through Core Tools with the `otel-worker-native` sample.

Still missing before production:

- Final names for the settings, `host.json` and `telemetryMode` support, and
  more instrumentations (`azure-sdk`, databases).
- Reconfiguring native telemetry during specialization. Right now the native SDK
  reads OTLP settings once, when the Rust process starts.
- HTTP response status on spans for streaming responses.
- Builds for Windows, Linux and macOS on x64 and arm64, plus signing and
  bundling into the worker package.
- Full extension/E2E parity testing and the section 8 benchmarks.

## 10. What we need from the OpenTelemetry team

The Rust OTel crate shouldn't live as a side project inside the worker. We're
asking the OpenTelemetry team to own it as a product package and to build the
opt-in model into it.

- **Own and publish the Rust OTel package.** Take the
  `rust/opentelemetry` prototype, or an equivalent, and
  ship it as a supported, versioned package. That includes the official build,
  signing, SBOMs and security servicing.
- **Build opt-in into the package.** One switch for OTel as a whole, and one per
  instrumentation (`invocation`, `logs`, `http`, `fetch`, `dns` and future
  ones). Anything turned off loads nothing and costs nothing.
- **Keep one OTel implementation for every language worker.** The same package
  should serve the Node.js worker first and be reusable by other workers later.
  Section 10.1 explains how. That's what "one OpenTelemetry for all" means here.
- **Follow the standards.** OTLP export, W3C Trace Context and current OTel
  semantic conventions, kept up to date as the specs change.
- **Agree on the contract with the worker.** Configuration keys, the IPC format
  for span data coming from JS hooks, and how the package handles reconfiguration
  during specialization.
- **Release on our schedule.** Ship builds for every supported OS and
  architecture, in step with the worker releases in section 11.

### 10.1 One Rust OTel library for four languages

Node.js is the first user, not the only one. Python already has a Rust worker,
so it can plug into the same Rust OTel library and get the same opt-in model
with little extra work. Go and Rust workers can follow the same pattern.

That gives us one library from the OpenTelemetry team serving four languages:

| Language | Worker | How it uses the Rust OTel library |
|---|---|---|
| Node.js | Rust worker (this proposal) | Links the library directly. JS hooks send span data over IPC |
| Python | Existing Rust worker | Links the library directly. Python hooks send span data the same way |
| Go | Rust-based worker (future) | Same integration pattern as Node.js and Python |
| Rust | Rust worker (future) | Uses the library natively, no bridge needed |

Every language gets the same switches, configuration keys, semantic
conventions and export behavior. A fix or a new instrumentation lands once and
ships to all four. Each language still needs its own thin hooks for
language-specific libraries, and each one must pass its own parity and cold
start checks before we call it supported.

## 11. Rollout plan

| Phase | Deliverable | Exit criteria |
|---|---|---|
| 0. Measure | Baseline and prototype benchmarks (section 8) | Go/no-go gates met |
| 1. Preview | Rust worker behind an opt-in app setting. Native OTel with `invocation` and `logs`, using the package from the OpenTelemetry team | E2E parity suite green on all platforms |
| 2. Instrumentations | Opt-in `http`, `fetch` and `dns` hooks, `telemetryMode` integration, specialization reconfiguration | Semantic-convention tests pass, no duplicate telemetry |
| 3. Default worker | Rust worker becomes the default for supported Node.js versions. The existing worker stays available as a fallback | Production telemetry shows cold start and stability equal or better |
| 4. Deprecate | Deprecate `@azure/functions-opentelemetry-instrumentation` with a migration guide | Adoption threshold met |

## 12. Risks

| Risk | Mitigation |
|---|---|
| Extra process and IPC cancel out the cold start gains | Benchmark gates, parallel startup, and an in-process N-API addon as a fallback option |
| Behavior differs from the current worker | Reuse the existing execution engine. Run the existing worker test suite plus a gRPC parity suite |
| Native binary packaging and supply chain | Build and sign through the official pipeline, generate SBOMs and pin dependencies with `--locked` |
| Customer stdout writes corrupt the IPC stream | Console output is already redirected. Next, move IPC off stdio to a dedicated pipe |
| Double instrumentation alongside a customer's JS SDK | Detect existing providers and document the behavior clearly |
| Fewer instrumentations than the JS ecosystem | Customers can still bring their own SDK. We add instrumentations as demand shows up |
| Behavior differs by OS, architecture, hosting plan or extension | Publish an explicit support matrix. Each target passes its platform build, extension/E2E parity and benchmarks before we announce support |
| The OpenTelemetry team can't take ownership of the Rust package in time | Agree on ownership and timelines before phase 1. Until then the worker team maintains the prototype |

## 13. Open questions

1. Where does configuration live: `host.json` `openTelemetry.node`, app
   settings, or both? Which wins when both are set?
2. Should `invocation` and `logs` be on by default whenever
   `telemetryMode: OpenTelemetry` is set?
3. Long term, do we keep the out-of-process Node.js engine from the prototype,
   or move to an in-process N-API addon?
4. Which instrumentations come after `http`, `fetch` and `dns`? Candidates
   include the Azure SDK, `pg`, `mongodb` and `redis`.
5. When do we deprecate `@azure/functions-opentelemetry-instrumentation`?
6. Do metrics belong in phase 2, or in a separate proposal?
7. Which team owns the Rust OTel package, and what timeline can the
   OpenTelemetry team commit to?
8. In what order do Python, Go and Rust adopt the shared library after Node.js?
