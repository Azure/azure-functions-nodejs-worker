# Proposal: Customer-Installed Rust OpenTelemetry Sidecar

| | |
|---|---|
| **Status** | Draft |
| **Area** | Azure Functions language packages (Node.js first), OpenTelemetry |
| **Goal** | Opt-in, platform-agnostic OTel with lower cold start, without making the host or worker own an OTel binary |
| **Related** | [Rust worker and opt-in OTel](./rust-worker-and-opt-in-otel.md) |
| **Prototype** | [`rust/opentelemetry-exe`](../../rust/opentelemetry-exe/README.md), [`rust/sample/otel-customer-exe`](../../rust/sample/otel-customer-exe), and the cold-start benchmark in [`rust/sample/otel-coldstart`](../../rust/sample/otel-coldstart/README.md) |

## 1. Summary

We'll ship OpenTelemetry for Functions apps as a **small Rust executable
(`azfunc-otel`) that the customer brings in**, wrapped in a thin package for each
language. For Node.js, that package is `@azure/functions-opentelemetry-native`.

- **Opt-in by design.** If the customer doesn't add the package, no OTel code
  loads and no process starts. If they do add it, each instrumentation (`http`,
  `dns`, `fetch`, `logs`, and so on) is still off until they turn it on.
- **Lightweight.** The SDK, batching, retry and export run in the Rust process,
  not in the language runtime. The language package only hooks events and writes
  compact records to the sidecar.
- **Platform-agnostic.** It exports OTLP and uses W3C Trace Context, so it works
  on Azure, in containers, locally and on other clouds, and can send to any
  OTLP backend. To reach Azure Monitor, it uses the OpenTelemetry Collector's
  `azuremonitorexporter`, which another team maintains.
- **No host or worker changes.** The Functions host and the language workers
  don't ship, version or patch the executable.

We also considered putting the executable in the **worker** or in the **platform
image**. Section 5 compares the three options. The main difference is who owns
the binary's lifecycle: who patches it, who versions it, and what has to be
redeployed across the cloud when one of its dependencies changes.

## 2. Problem

- Today's Node.js OTel setup loads the JavaScript SDK, exporters and
  auto-instrumentations on the startup path, before the first invocation. That
  adds to cold start whether or not the customer needs every instrumentation.
- Customers can't easily pick which instrumentations run. Each language does
  setup differently, and some paths only work on Azure.
- Every telemetry dependency the platform ships becomes something the platform
  has to keep patching. If the OTel SDK or an exporter has a security fix or a
  breaking change, that change has to roll out to every stamp.

## 3. Proposed solution

```text
Customer app (standard language worker, unchanged)
  └─ language package, e.g. @azure/functions-opentelemetry-native
       ├─ enable({ instrumentations: [...] })  ← customer opt-in
       ├─ invocation hooks + selected observers (http / dns / fetch / logs)
       │      compact NDJSON records over stdin (fire-and-forget)
       ▼
     azfunc-otel  (Rust, static binary, bundled in the package)
       ├─ OTel SDK: spans, logs, sampling, batching, retry
       ├─ OTLP/HTTP ─► OpenTelemetry Collector ─► azuremonitorexporter ─► Application Insights
       ├─ optional: direct Azure Monitor (build feature, off by default)
       └─ console (local development)
```

### 3.1 Customer experience

```js
// First line of the app entry point.
require('@azure/functions-opentelemetry-native').enable({
    instrumentations: ['http', 'fetch'], // or OTEL_NODE_ENABLED_INSTRUMENTATIONS=http,fetch
});
```

Customers configure the package with standard `OTEL_*` settings, plus a small
set of Functions-specific settings documented in the
[prototype README](../../rust/opentelemetry-exe/README.md).

### 3.2 Design rules for the executable

| Rule | Why |
|---|---|
| Static binary with no runtime dependencies (musl on Linux, `rustls` instead of OpenSSL) | Runs in any image and doesn't depend on the system TLS library |
| OTLP/HTTP by default, Collector-first | Smallest exporter surface. The Collector team owns the Azure Monitor mapping. |
| Feature flags for optional exporters | Customers who don't need an exporter don't pay for it in size |
| Size budget of 5 MB per platform | The prototype is about 4.2 MB for both `linux-x64-musl` and `win32-x64` |
| Start lazily (after the first invocation or an idle delay) | Keeps process spawn off the first-request path |
| The app never waits on the sidecar | If the sidecar fails, telemetry is lost but the app keeps working |
| Wrapper and executable ship in one package version | The IPC contract between them never drifts (see 6.2) |

### 3.3 Other languages

The executable doesn't depend on any language. Each language ships its own thin
wrapper, for example on PyPI, NuGet or Maven, that bundles the same `azfunc-otel`
build and adds that runtime's hooks. Most of the code lives in the one Rust
binary, so the language packages stay small.

## 4. Options considered

| | **A. Customer-installed (proposed)** | **B. Bundled in the worker** | **C. Bundled in the platform image** |
|---|---|---|---|
| Where the executable lives | In the app's dependencies (npm, PyPI, etc.) | In each language worker's payload | In the Functions base or host image |
| Who chooses the version | Customer | Worker release | Image release |
| How a fix reaches apps | Package release, then customer updates | Worker release, host bundle, cloud-wide deployment | Image build, cloud-wide deployment, then customer rebuilds for custom containers |
| Cost when OTel is off | None | Disk and image size only | Disk and image size only |

## 5. Pros and cons

### 5.1 Option A: customer-installed executable with a language package (proposed)

**Pros**

- **Opt-in is structural.** Without the package, no OTel code exists in the app
  at all. Apps that don't use OTel get no cold-start or size cost.
- **No platform dependency management.** The host and workers carry no OTel
  crates, so OTel or exporter CVEs never force a host or worker release.
- **Release cadence is separate from the cloud.** We can ship a fix the same day
  through a package release, with no stamp-by-stamp rollout.
- **The customer controls the version.** They can pin, upgrade or roll back per
  app, so one app's upgrade doesn't affect any other app. Rollback only affects
  that app.
- **There's no version-skew matrix.** The wrapper and executable ship together,
  so their IPC protocol always matches (see 6.2).
- **Platform-agnostic.** The same package works on Functions (Consumption, Flex,
  Premium, Dedicated, containers), in Core Tools locally and outside Azure.
- **It reuses maintained components.** The Collector and `azuremonitorexporter`
  come from the OpenTelemetry and Azure Monitor teams, not from us.
- **The ecosystem fits.** This is how tools like esbuild, SWC and Prisma already
  ship native binaries.

**Cons and mitigations**

| Con | Mitigation |
|---|---|
| Customers have to update to get security fixes. The platform can't patch them automatically. | Dependabot and Renovate support, security advisories, a startup warning when the version is below the minimum supported, and a published support window |
| More versions run in the field, which makes support harder | Support only the latest N minor versions. The sidecar reports its own version as a resource attribute. |
| The deployment package grows by about 4–5 MB per bundled platform | Include only the needed platform. Keep exporters behind feature flags. Strip and use LTO. |
| A cross-platform build can miss the right binary (for example, `npm install` on Windows and deploy to Linux) | Per-platform optional dependencies, plus a `--target linux-x64` install helper, a remote build or an all-platforms option. If the binary is missing, warn clearly and continue without telemetry. |
| Executable permissions can be lost in the zip (seen in the prototype) | Packaging tooling keeps mode 0755. The wrapper runs `chmod` again before it spawns the sidecar. |
| Some sandboxes may restrict child processes | Validate every SKU. Disable telemetry gracefully, and never fail the app. |
| The sidecar can't start until the app process starts, so it can't be pre-started in the placeholder | Use a lazy or idle start. The benchmark measures the remaining cost (section 7). |
| We maintain one wrapper per language | Wrappers are thin, and the shared logic lives in the Rust binary |

### 5.2 Option B: executable bundled in the language worker

**Pros**

- Customers add no dependency. They turn OTel on with app settings only.
- Each worker release runs one known, tested version.
- The worker could start the sidecar early, or reuse a prewarmed one.
- It could integrate directly with worker internals, such as invocation context
  and the gRPC channel, instead of using wrapper hooks.

**Cons**

- **The worker has to manage OTel's dependency tree.** OTel SDK, OTLP, TLS and
  HTTP client crates become worker dependencies. A CVE or breaking change in any
  of them needs a worker release.
- **Every fix needs a cloud-wide deployment.** Workers ship inside the host
  bundle, so a fix goes through the worker release, host integration, then
  rollout to every region and stamp. That takes weeks, not hours.
- **Versions are coupled.** The exe version is tied to the worker version, which
  is tied to the host version. Customers can't upgrade or roll back OTel on
  their own. If the worker is written in Rust, its crate versions (`tonic`,
  `prost`, `tokio`) also have to stay compatible with the OTel crates.
- **Version skew still exists.** Customer code that calls an OTel API still has
  to match whatever exe version the worker shipped. That means a compatibility
  window and version negotiation.
- **Every app pays.** Apps that never turn on OTel still carry the binary in the
  worker payload and image.
- **Work is duplicated across languages.** Each worker (Node.js, Python, Java,
  PowerShell, .NET isolated) would bundle, test and patch its own copy.
- **A bad release has a large blast radius.** A regression hits every app on
  that worker version, not just the apps that chose to upgrade.
- **Local parity depends on the tooling.** Core Tools and custom images have to
  ship the same build.

### 5.3 Option C: executable bundled in the platform image

**Pros**

- One binary serves every language. Each image has one copy.
- The platform could pre-start it in the placeholder (standby) process, which
  may give the best cold-start result.
- It can be patched centrally without customer action, at least for platform
  images.
- Customers add no dependency.

**Cons**

- **Fixes ride the slowest release train.** Image builds, then validation, then
  regional rollout per OS, runtime and SKU. Every OTel or TLS dependency update
  needs a cloud-wide deployment.
- **Customer containers don't get fixes automatically.** Customers who build
  from our base images only get the fix when they rebuild and redeploy. That
  leaves a long tail of vulnerable versions that we still own.
- **It isn't platform-agnostic.** The binary only exists on our images. Local
  development, other clouds and non-Functions hosting need a separate
  distribution, so we end up shipping it twice.
- **We'd need a version matrix.** Customer-side wrappers ship on their own
  schedule, but the exe version comes from the image. We'd need a versioned IPC
  protocol, capability negotiation, and support for N-k image versions against
  M wrapper versions.
- **Ownership is unclear.** Image, host, worker and OTel teams all touch it.
  Incident routing and SLAs are harder to set.
- **Every app pays the image size,** and possibly a background process if it's
  pre-started for everyone.
- **Breaking changes can't be opted into.** An exporter or semantic-convention
  change would flip for every app at once.

## 6. Managing the executable

### 6.1 Dependency management

`azfunc-otel` depends on the OTel SDK, the OTLP exporter, an HTTP client and
TLS. These crates change often, and TLS gets security fixes.

| | A. Customer-installed | B. Worker | C. Image |
|---|---|---|---|
| Who updates the crates | Package owners (OTel team) | Worker team | Image and platform team |
| Who has to redeploy after a CVE | Customer, after a package release | Every stamp, after worker and host releases | Every stamp, plus customer container rebuilds |
| Time to fix (typical) | Hours to days | Weeks | Weeks or longer |
| Effect on host and worker dependency graph | None | OTel crates in worker | OTel binary in image inventory |

### 6.2 Versioning

- **A:** One package version contains both the wrapper and the executable, so
  their IPC contract always matches. We only need semver on the public API
  (`enable()` options and settings). If a customer pins an old version, that's
  their choice.
- **B and C:** The executable and the code talking to it are released
  separately. We'd need:
  1. A versioned IPC protocol with a handshake and a capability list.
  2. A support policy for wrapper N against executable N-k (and the other way).
  3. A test matrix for those combinations.
  4. A deprecation process that waits for every stamp to update before an old
     protocol can be removed.

### 6.3 Downstream dependency changes

If OTLP, semantic conventions or the Collector exporter change:

- **A:** We release a new package version. Customers move on their own
  schedule. Old and new versions can run in different apps at the same time.
- **B and C:** We need a coordinated release and cloud-wide deployment. Every
  app on the new host or image gets the change at the same time.

## 7. Cold-start validation

The benchmark in [`rust/sample/otel-coldstart`](../../rust/sample/otel-coldstart/README.md)
runs three otherwise identical Flex Consumption apps. A timer probe calls them
every 30 minutes.

| App | Variant |
|---|---|
| `otel-coldstart-baseline-*` | No OTel |
| `otel-coldstart-exe-*` | Option A: Rust executable |
| `otel-coldstart-node-*` | npm Node.js OTel SDK with HTTP, DNS and Undici instrumentation |

We don't have results yet. Measurement takes priority over the hypothesis. We'll
decide based on paired cold-start p50 and p95 across enough rounds. Options B and
C could do better than A on cold start only if the sidecar is pre-started in the
placeholder. If A's cost over the baseline is close to zero, that advantage
doesn't matter.

## 8. Recommendation

Choose **Option A** as the delivery model:

- It's the only option that is opt-in by construction and platform-agnostic.
- It keeps OTel dependencies out of the host and workers, so OTel fixes don't
  need cloud-wide deployments.
- Its maintenance is mostly the OTel team's package plus the Collector team's
  exporter.

Revisit B or C only if the benchmark shows a material cold-start penalty that
placeholder pre-start could remove. Even then, a hybrid is better: the platform
keeps a cache of approved executables, but the version still comes from the
customer package.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Customers run old, vulnerable versions | Minimum-version warning, advisories, Dependabot, documented support window |
| Child-process limits on some SKUs | Validate each SKU. Fall back to telemetry-off. |
| Missing platform binary after a cross-platform build | Clear warning, install helper, remote-build guidance |
| No official Rust Azure Monitor exporter | Collector-first. The direct exporter stays an optional feature. |
| Telemetry lost if the sidecar crashes | Supervise and restart once. Record a drop counter. Never block the app. |

## 10. Open questions

1. Who publishes the language packages: the OTel team, the Functions team or
   both?
2. Which platforms do we support first: `linux-x64` and `linux-arm64` only, or
   Windows too?
3. Should the platform ever provide a Collector endpoint, or do customers always
   configure their own?
4. What minimum-version policy do we enforce, and do we warn or disable when a
   version is below it?
5. Do we need an all-platforms package for customers who deploy from a
   different OS than they run on?
