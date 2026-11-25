# Rust versus Node.js OTel cold-start comparison

Three HTTP Function Apps and an independent timer Function App run on the **standard
Node.js worker**, without host or worker changes.

| Sample | Behavior |
| --- | --- |
| [with-customer-exe](./with-customer-exe/) | Hello World with the customer OTel package, Linux Rust executable, invocation spans, and opt-in `http,dns,fetch,logs` hooks. |
| [without-otel](./without-otel/) | Matching Hello World without the customer OTel package or executable. Standard Functions host monitoring remains enabled in both apps. |
| [with-node-otel](./with-node-otel/) | Matching Hello World with the JavaScript OTel SDK, npm HTTP/DNS/Undici instrumentation packages and console span/log export; no Rust executable. |
| [probe](./probe/) | Invokes all three APIs concurrently every 30 minutes, then attempts a same-worker warm-control request to each. |

All HTTP samples implement `GET /api/hello`, require a function key, return
`Hello World`, and include the same measurement fields. The treatment additionally
loads and enables the customer package. It fails startup if `enable()` reports
disabled telemetry. This check is specific to the experiment; the package's
customer fail-open behavior is unchanged.

## What this experiment measures

- Client end-to-end time, including DNS, TCP/TLS, platform routing, host/worker
  initialization, hooks, handler execution and response transfer.
- Entry-module load time, worker uptime, a random worker `bootId`, invocation
  count, first-invocation marker, instance ID and round ID. The instance ID uses
  `WEBSITE_INSTANCE_ID` when present, otherwise the machine/container hostname
  (Flex Consumption does not always expose that environment variable).
- A **worker-first request is a cold-start candidate**, not proof of a fully cold
  Azure host. Thirty minutes of inactivity does not guarantee scale to zero.
  Existing-worker requests and same-worker warm controls have separate labels.
- No HTTP client retries or redirects; failed/invalid responses are explicitly
  logged. A warm control is skipped when that target's idle probe fails.
- Both probe requests use a fresh HTTP connection. The warm control follows the
  idle request immediately and can include deferred sidecar startup effects.

The timer schedule is `0 */30 * * * *` (UTC, at minute 0 and 30).
`runOnStartup` is false and schedule monitoring is enabled. Its timer app is
isolated from the three measured apps. Target-side health probes and availability
tests are deliberately absent to avoid warming them between rounds.

The Rust and Node OTel treatments use **console exporters**, captured by host logs, for this
initial SDK/exe experiment. No Collector is provisioned. The HTTP handler does
not make outbound calls; the selected client hooks are installed but their
per-operation overhead is not part of this Hello World comparison. Production
OTLP export/network costs and an outbound-workload comparison are separate tests.
The sidecar still starts after the first invocation or its existing idle delay:
its startup work is **deferred, not removed**.

The Node variant initializes `@opentelemetry/sdk-node` before loading
`@azure/functions`. `OTEL_NODE_ENABLED_INSTRUMENTATIONS=http,dns,fetch,logs`
selects npm HTTP, DNS and Undici (Node fetch) hooks and invocation log export.
Because Functions HTTP handlers execute over RPC rather than a Node HTTP server,
the sample explicitly creates a server span and propagates the host trace context.
Host logging stays enabled identically in all apps: the Azure Functions OTel
instrumentation package is deliberately not used because it advertises a worker
capability that suppresses host-forwarded user logs.

Both console pipelines use simple processors; the Rust pipeline exports in a
separate process while Node exports within its worker. Metrics are disabled in
the Node SDK. Both cloud OTel apps explicitly set `OTEL_TRACES_SAMPLER=always_on`
so an unsampled host parent does not suppress invocation export in either
treatment. This sampler change begins with the three-variant experiment; do not
pool earlier two-variant rounds into export-overhead comparisons.
This experiment compares these configured implementations, not
every possible Node SDK configuration. Production batch/OTLP export needs a
separate matched experiment. Dependencies are version-pinned and locked.

## Build and package (PowerShell 7 on Windows)

Prerequisites: Rust/rustup, `cargo-zigbuild`, Python with `ziglang`, npm, and Azure
CLI with Bicep. Install missing cross-build prerequisites if necessary:

```powershell
cargo install cargo-zigbuild --locked
python -m pip install --user ziglang
rustup target add x86_64-unknown-linux-musl
```

From this directory:

```powershell
& .\scripts\Build-LinuxSidecar.ps1
& .\scripts\Prepare-Apps.ps1 -LinuxExe ..\..\target\x86_64-unknown-linux-musl\release\azfunc-otel
node --test .\test\benchmark.test.cjs
az bicep build --file .\infra\main.bicep --stdout > $null
```

The packaging script creates self-contained, locked, ready-to-run ZIPs under
`artifacts/`. It stages the local native npm package into the treatment only;
there is no dependency on sibling source directories after deployment. It
rejects Windows binaries and sets Unix executable permissions in the ZIP.
No npm scripts or Rust builds run at app startup. Staged apps can be found under
the printed `artifacts/stage-*/` path. To run the staged treatment locally on
Windows, explicitly set `AZURE_FUNCTIONS_OTEL_EXE` to a built Windows sidecar;
the deployment ZIP itself contains only the Linux sidecar.

## Azure configuration

Default deployment values are in [main.parameters.json](./infra/main.parameters.json).
They target the private test subscription specified for this experiment,
`westus3`, and a **new** resource group `rg-otel-coldstart-86a4`.

| App | Plan / runtime |
| --- | --- |
| `otel-coldstart-exe-86a4` | Linux Flex Consumption FC1, Node.js 22, 2048 MB |
| `otel-coldstart-baseline-86a4` | Same |
| `otel-coldstart-node-86a4` | Same |
| `otel-coldstart-probe-86a4` | Same |

All four plans have zero always-ready instances and a maximum scale limit of
40 (the platform minimum for this setting). All HTTP apps use concurrency 1.
Each app has its own managed identity and host/deployment storage. Shared
Application Insights/Log Analytics captures logs with sampling disabled; API
keys are stored in Key Vault and read by the probe using managed identity.
SCM/FTP basic authentication is disabled.

The Bicep templates use documented, compiler-supported GA API versions for Flex
Consumption rather than provider-listed future versions lacking local schemas.
Identities are user-assigned so deployment storage permissions can exist before
the app starts.

**Provision only after reviewing the plan and costs.** The infrastructure's
`probeEnabled` parameter defaults to false. Deployment order:

1. Preview and provision the subscription-scope [main.bicep](./infra/main.bicep).
2. Deploy all HTTP ready-to-run packages with Functions Flex managed package
   deployment, with remote build disabled.
3. Retrieve each HTTP app's function key securely, seed `exe-function-key` and
   `baseline-function-key` and `node-otel-function-key` in Key Vault, and allow RBAC to propagate.
4. Verify all HTTP responses, actual `[azfunc-otel] ready ... exporter=console`
   and Rust span export logs, and `[node-otel] ready` plus Node span/log export.
   HTTP 200 alone does **not** prove SDK or sidecar health.
5. Redeploy the infrastructure with `probeEnabled=true nodeOtelProbeEnabled=true`
   and refresh the probe's Key Vault references if needed. Deploy the three-target
   probe ZIP only after all three references resolve. Verify an actual execution
   and six measurement records. Until the Node app/key are ready, keep
   `nodeOtelProbeEnabled=false` and the existing two-target probe code.

No Azure resources are created by the build/packaging scripts. There is no
guaranteed fixed cost: the planning estimate is about US$5/month for low test
traffic for the original two-target experiment; the third target adds compute,
storage and logs, so budget approximately US$8/month, not a spending cap.
Actual usage and shared free grants affect charges. Remove the experiment's
resource group after collecting enough samples to stop ongoing test charges.

## Search and compare

All response/measurement records start with `otel-coldstart ` followed by JSON,
including the variant (`customer-exe`, `node-otel` or `baseline`) and shared `roundId`.
Use [queries.kql](./queries.kql) in the shared Application Insights Logs view for
sample counts and p50/p95/p99 grouped by phase and worker classification.
The paired comparison query correlates measurements to host `Timer fired`
execution logs using `operation_Id`, excluding manual validation, and excludes
past-due (for example deployment-transition) rounds. It includes only successful idle-phase
worker-first candidates for all three variants, and reports entry-module load
time plus the median paired Rust latency reduction versus Node. Positive values
favor Rust; negative values favor Node. Always report paired sample counts and
inspect errors separately. These observational timings include platform variance
and do not establish causality or significance from a small sample.
The workspace has 30-day retention; export measurements before they expire.
Errors are listed explicitly rather than treated as fast successful responses.

Wait for multiple scheduled rounds and enough **worker-first** samples in each
variant before drawing conclusions. Deployment validation requests warm workers
and are not part of the timer's measurement dataset. Do not equate server
handler duration with client-observed cold-start latency, and do not infer a
reliable overhead figure from a single pair.

The first three-target scheduled round at **2026-11-25 20:30 UTC** returned six
successful measurements. It was past-due during deployment, so it is excluded
from the paired performance query. A subsequent one-time administrative probe
also returned six successes and is excluded via its host operation correlation.
These runs verify functionality, not comparative performance. Allow uninterrupted
scheduled rounds after deployment before estimating improvements.

## Operating this experiment

The first scheduled round completed successfully at **2026-11-25 18:30 UTC**:

| Variant | Idle-phase request | Warm-phase request |
| --- | ---: | ---: |
| Customer Rust OTel executable | 2492 ms | 1977 ms |
| Baseline without package/executable | 3560 ms | 2130 ms |

These are individual client-observed timings, **not an OTel overhead estimate**.
All four requests reached different worker boot IDs and were correctly classified
as `worker-first`. In particular, neither warm-phase request was a verified
same-worker warm control. A single round cannot establish comparative cold-start
performance. Actual Rust ready and span-export records were also verified in
Application Insights.

The reference deployment uses a private test subscription, resource group
`rg-otel-coldstart-86a4`, and the four app names listed above. The HTTP endpoints
are `https://{app-name}.azurewebsites.net/api/hello`; supply the function key in
`x-functions-key`, not the URL. Monitoring is in `appi-otel-coldstart-86a4` and
`log-otel-coldstart-86a4`. Secrets are in `kv-otel-cs-86a4`.

After rebuilding the packages, redeploy from this directory:

```powershell
$subscription = '<subscription-id>'
$packages = @{
    'otel-coldstart-exe-86a4' = 'with-customer-exe'
    'otel-coldstart-baseline-86a4' = 'without-otel'
    'otel-coldstart-node-86a4' = 'with-node-otel'
    'otel-coldstart-probe-86a4' = 'probe'
}
foreach ($package in $packages.GetEnumerator()) {
    az functionapp deployment source config-zip --subscription $subscription `
        --resource-group rg-otel-coldstart-86a4 --name $package.Key `
        --src ".\artifacts\$($package.Value).zip" --build-remote false
    if ($LASTEXITCODE -ne 0) { throw "Deployment failed for $($package.Key)" }
}
```

Code deployments warm the apps and can reset worker measurements. Do not deploy
during an uninterrupted collection window. If redeploying infrastructure after
initial setup, explicitly pass `probeEnabled=true nodeOtelProbeEnabled=true` to keep collection enabled;
the safe initial-deployment default is false.

To stop collection without deleting data:

```powershell
az functionapp config appsettings set --subscription $subscription `
    --resource-group rg-otel-coldstart-86a4 --name otel-coldstart-probe-86a4 `
    --settings 'AzureWebJobs.coldStartProbe.Disabled=true' --output none
```

After exporting the results, delete the experiment to stop its ongoing charges:

```powershell
az group delete --subscription $subscription --name rg-otel-coldstart-86a4 --yes --no-wait
```

Alternatively, list and delete only resource groups tagged for this experiment's
onboarding session:

```powershell
az group list --subscription $subscription `
    --tag app-onboard-session-id=86a4775b-dcab-43cb-8258-fa919590f8b5 `
    --query '[].name' --output tsv |
    ForEach-Object { az group delete --subscription $subscription --name $_ --yes --no-wait }
```
