# Threat Model Reference

## Protected Assets

- integrity and availability of the long-lived Node.js worker process
- confidentiality of application settings, credentials, invocation data, and internal paths
- integrity of Host-worker messages, function metadata, bindings, and invocation results
- separation between successive app specializations and unrelated invocations where promised
- provenance of generated RPC artifacts, bundled code, dependencies, and release packages
- diagnostic fidelity without disclosure of sensitive data

## Trust Boundaries

### Host to Worker

The Host starts the worker and sends privileged protobuf lifecycle and invocation messages over gRPC. The worker relies on the Host for worker ID, request IDs, app directory, environment, metadata, bindings, and invocation data.

Default posture: trust the Host as the control plane, but validate data needed for worker correctness, memory safety, availability, and compatibility. Label findings that require a malicious or compromised Host as defense in depth unless another actor can influence the same field through the Host.

Primary code: `src/Worker.ts`, `src/GrpcClient.ts`, `src/setupEventStream.ts`, `src/eventHandlers/`, and `azure-functions-language-worker-protobuf/src/proto/`.

### Function App to Worker Process

The selected function app supplies `package.json`, JavaScript modules, exports, hooks, and function callbacks. It is intentionally executable in the worker process.

Default posture: do not claim isolation from the app itself unless the platform contract promises it. Look for unintended loading outside the selected app, stale state across specialization, accidental privilege from worker internals, and secret leakage caused by worker behavior.

Primary code: `src/startApp.ts`, `src/loadScriptFile.ts`, `src/LegacyFunctionLoader.ts`, `src/setupCoreModule.ts`, `src/coreApi/`, and `src/hooks/`.

### External Caller to Invocation

Trigger and binding data can originate from untrusted external callers even though the Host serializes it. Preserve type and size assumptions through RPC/core converters and the programming model.

Primary code: `src/eventHandlers/InvocationHandler.ts` and `src/coreApi/converters/`.

### Worker to Host Diagnostics

Responses, errors, exceptions, and logs leave the worker process and can be persisted or displayed. User code, bindings, paths, environment values, and dependency errors can introduce secrets.

Primary code: `src/setupEventStream.ts`, `src/errors.ts`, `src/utils/errorSanitizer.ts`, `src/utils/Logger.ts`, `src/WorkerContext.ts`, and `src/coreApi/coreApiLog.ts`.

### Build and Supply Chain

Dependencies, code generation, bundling, NuGet packaging, worker configuration, and pipelines determine what executes and ships.

Primary code: `package.json`, lockfiles when present, `scripts/`, `webpack.config.js`, `Worker.nuspec`, `worker.config.json`, and `azure-pipelines/`.

## Source-to-Sink Review Table

| Source                  | Transform                                    | Sink                                | Security questions                                                                              |
| ----------------------- | -------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| startup CLI values      | `minimist`, URL and integer parsing          | gRPC channel, worker state          | accepted schemes, endpoint authority, numeric bounds, error disclosure                          |
| `StreamingMessage`      | protobuf decode and `content` dispatch       | handler and response                | missing/ambiguous content, semantic validation, message size, correlation, fail-closed behavior |
| app directory           | path operations and package parsing          | `chdir`, glob, filesystem           | intended root, canonicalization, platform semantics, symlinks, failure rollback                 |
| function metadata       | script path and entry-point selection        | require/import and callback         | who controls metadata, allowed target, export type, cache/state behavior                        |
| package `main`          | glob expansion and ordering                  | module loader                       | expansion scope, deterministic order, resource amplification                                    |
| environment map         | map conversion and assignment                | `process.env`                       | partial failure, key casing, dangerous runtime variables, stale state, rollback                 |
| invocation/binding data | typed-data and metadata converters           | programming model and user callback | type confusion, encoding, allocation, prototype-sensitive keys, mutation                        |
| user error/log          | coercion, hooks, serialization, sanitization | RPC log or failure response         | all output paths, structured/circular data, secret variants, amplification                      |
| app hook                | sequential async execution                   | invocation/start/termination        | thrown errors, hangs, reentrancy, stale state, ability to suppress diagnostics                  |
| dependency update       | npm resolution, generation, bundling         | shipped worker                      | provenance, runtime reachability, scripts, transitive churn, advisory applicability             |

## Security Test Design

Write tests at the closest public boundary:

- inject Host messages through `test/eventHandlers/TestEventStream.ts`
- build expected RPC outputs with `test/eventHandlers/msg.ts`
- use files only under temporary test-app directories
- use fake credentials with recognizable sentinels and assert the sentinel is absent from every output field
- snapshot and restore `process.env`, working directory, listeners, module state, timers, and stubs
- cover both success and partial-failure state transitions
- use bounded input sizes that demonstrate complexity without exhausting the developer machine
- test Windows and POSIX path logic independently when behavior is platform-neutral

For protocol changes, test old and new message shapes according to the compatibility policy and run an actual Host integration check. For concurrency issues, control promises deterministically instead of relying on sleep timing.

## Finding Decision

Classify a candidate as:

- Vulnerability: an intended security boundary can be violated under realistic preconditions.
- Defense in depth: a privileged/trusted component must already be compromised, but local validation would reduce impact.
- Hardening: improves resilience without a demonstrated security-property violation.
- Compatibility/correctness bug: behavior is wrong but lacks a credible security impact.
- Not a finding: expected behavior or mitigated upstream.

Document unknown Host assumptions as questions. Do not turn an unknown into a confirmed vulnerability.
