---
name: azure-functions-node-worker-security
description: 'Security analysis for the Azure Functions Node.js worker. Use automatically or as /azure-functions-node-worker-security when code or a proposed change touches Host RPC input, function metadata, paths, package or module loading, require/import/eval, environment variables, process state, invocation data, protobuf conversion, hooks, logs, errors, credentials, gRPC transport, dependencies, build/release files, denial of service, or cross-invocation isolation. Identify evidence-backed vulnerabilities, rank severity, avoid expected-behavior false positives, and define regression tests.'
argument-hint: '[diff, file, flow, or security concern]'
user-invocable: true
disable-model-invocation: false
---

# Azure Functions Node.js Worker Security

Perform a focused security analysis of the requested change or flow. Also apply the `azure-functions-node-worker` domain skill so findings respect the Host-worker contract and Node.js process model.

Read [threat-model.md](./references/threat-model.md) when analyzing a trust-boundary crossing, dynamic code loading, transport, process-wide state, or dependency change.

## Security Standard

A security finding requires all of the following:

1. A security property that should hold.
2. An attacker or less-trusted source that can influence data or control flow.
3. A concrete source-to-sink path in this repository.
4. Preconditions that are possible under the documented deployment model.
5. A credible confidentiality, integrity, availability, or isolation impact.
6. Evidence that existing validation or an upstream trust guarantee does not already prevent the path.

Do not report a vulnerability from a sensitive API name alone. Separate confirmed vulnerabilities from defense-in-depth improvements, hardening suggestions, and questions about the Host contract.

## Required Workflow

### 1. Set Scope and Security Properties

Identify the changed behavior, not only changed files. State which properties matter:

- only the intended Host endpoint can control the worker
- only intended function-app code and exports are loaded
- RPC and invocation data retain type, size, and binding boundaries
- credentials and sensitive data do not cross logs or error responses
- one app, specialization, or invocation does not inherit unintended state from another
- malformed or adversarial input cannot crash, hang, or exhaust the worker disproportionately
- generated artifacts and shipped dependencies correspond to reviewed sources

For a code-writing task, analyze the proposed data flow before editing and re-check the actual diff afterward. For a review task, inspect changed lines plus the nearest validators, callers, sinks, and tests.

### 2. Establish the Threat Actor

Choose the relevant source explicitly:

- function-app author controlling package metadata and executable app files
- external caller controlling trigger or binding data delivered through the Host
- privileged Azure Functions Host sending lifecycle, metadata, and invocation messages
- local process or network actor able to reach a configured worker endpoint
- package publisher or compromised build input

The Host is normally a privileged peer, not an anonymous remote client. Findings that require a compromised Host must be labeled defense in depth unless the supported boundary says otherwise.

### 3. Trace Source to Sink

Trace concrete values through the worker:

`source -> parser/decoder -> validation/canonicalization -> state/converter -> sensitive sink -> observable impact`

Review the applicable sinks:

- `require`, dynamic `import`, entry-point lookup, package `main`, and glob expansion
- filesystem access, path resolution, drive/UNC handling, symlinks, and working-directory changes
- `process.env`, process listeners, termination, module cache, timers, and global app state
- protobuf decoding/verification, converters, buffers, JSON, binding maps, and response construction
- gRPC endpoint selection, credentials, message-size limits, and stream error handling
- logs, exception messages/stacks, hook-transformed logs, and sanitization
- retries, synchronous work, unbounded collections, recursion, allocation, and user-controlled output
- package manifests, lockfiles, generation scripts, webpack, NuGet packaging, and pipelines

### 4. Test the Hypothesis

Try to disprove each candidate issue before reporting it:

- find upstream validation or a Host guarantee
- verify whether the source is actually attacker-controlled
- verify whether the sink is reachable in production
- distinguish process-wide behavior that is intentional for one function app
- construct the smallest safe regression test for the claimed boundary

Test boundary values appropriate to the flow, including missing/null values, maximum sizes, duplicate or unexpected map keys, malformed encoded data, mixed path separators, absolute/drive-relative/UNC paths, traversal segments, symlinks, circular error objects, secret-bearing URLs, concurrent invocations, specialization during outstanding work, and hooks that throw or never settle.

Do not create exploit files outside the test workspace, access real credentials, contact production endpoints, or print discovered secret values. Use synthetic values and repository test fixtures.

### 5. Validate the Fix or Finding

Run the nearest security regression first, then the domain-required checks. Typical focused commands are:

```powershell
npx mocha -r ts-node/register "test/errors.test.ts"
npx mocha -r ts-node/register "test/loadScriptFile.test.ts"
npx mocha -r ts-node/register "test/eventHandlers/FunctionEnvironmentReloadHandler.test.ts"
npx mocha -r ts-node/register "test/eventHandlers/InvocationHandler.test.ts"
```

For dependency changes, inspect the manifest and lockfile diff and run `npm audit --omit=dev` when a lockfile and network access are available. Never run `npm audit fix`, replace packages, or accept a major update automatically. Verify runtime reachability and review install/build scripts instead of treating an advisory count as proof of exploitability.

Complete applicable repository checks:

```powershell
npm run lint
npm test
npm run build
```

Use `npm run webpack` for bundle or package changes and `npm run host-sanity` for Host-boundary changes when prerequisites are available.

### 6. Report Findings

List findings first, ordered by severity. For each finding include:

- `Severity` and `confidence`
- affected file and symbol
- violated security property
- attacker-controlled source and sensitive sink
- concrete execution path
- required preconditions and trust assumptions
- impact
- existing mitigation and why it is insufficient
- smallest remediation that preserves Host and Node.js compatibility
- regression test and validation status
- `Human review required: yes/no` with the trigger

Use severity based on realistic impact and exploitability:

- Critical: practical compromise across an intended isolation or control boundary with broad impact
- High: practical code execution, credential disclosure, integrity loss, or reliable worker denial of service
- Medium: constrained impact, strong preconditions, or meaningful defense-in-depth failure
- Low: limited security impact or hardening with a plausible misuse path

If there are no evidence-backed findings, say so and list only residual assumptions or untested security boundaries. Do not inflate severity because a file is critical.

## Repository-Specific Checks

- Host messages: protobuf shape verification is not semantic validation. Check required relationships, sizes, one-of behavior, correlation IDs, and response/error handling.
- Paths and loading: establish the intended app-root contract before requiring containment. Account for Windows and POSIX semantics and symlink behavior.
- Environment reload: examine partial-failure behavior, rollback, dangerous process-wide changes, casing on Windows, and state left by the previous app.
- Invocation: check typed-data conversions for lossy encoding, excessive allocation, prototype-sensitive keys, and confusion between user and system data.
- Logs and errors: trace every Host-bound string. Sanitization must not leak the secret through stacks, URLs, structured objects, fallback logs, or hooks.
- Availability: treat event-loop blocking, unlimited retries, message amplification, and hanging hooks as security issues only when less-trusted input can trigger material impact.
- Dependencies: review runtime reachability, provenance, lockfile integrity, lifecycle scripts, transitive changes, and shipped bundle contents.

## False-Positive Guardrails

- Loading and executing the selected function application is the worker's purpose; it is not by itself arbitrary code execution.
- CommonJS module caching and app-level hook persistence can be intentional within one function app.
- `grpc.credentials.createInsecure()` for a Host-provided trusted localhost endpoint is an explicit compatibility mode, not automatically a vulnerability.
- Host-controlled paths, metadata, and environment values are privileged inputs. A missing worker-side check can be hardening rather than an exploitable boundary bypass.
- `eval` used only to preserve a dynamic `import()` through TypeScript compilation is not code injection unless untrusted text becomes executable syntax outside the intended module specifier.
- Generated `rpc.js`, `rpc_static.js`, and `rpc.d.ts` should be reviewed against `.proto` source, not treated as independent hand-written flaws.

Any change that affects a listed trust boundary, executable-code selection, sanitization, process lifecycle, protocol compatibility, or runtime dependencies must also apply `azure-functions-node-worker-critical-path` and receive human review.