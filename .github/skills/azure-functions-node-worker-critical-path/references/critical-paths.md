# Critical Paths and Gate Levels

Use changed behavior as the deciding signal. A path list helps discovery but does not replace semantic analysis.

## Gate A: Human Decision Before Implementation

Use Gate A when a proposal changes any of these contracts or trust assumptions:

| Contract                       | Examples                                                                                                                                     | Primary paths                                                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host-worker wire compatibility | add/remove/retype a message or field, change response status/correlation, alter unknown-message behavior                                     | `azure-functions-language-worker-protobuf/src/proto/`, `src/setupEventStream.ts`, `src/eventHandlers/EventHandler.ts`                                 |
| connection trust               | accept a new URI scheme, change TLS/localhost policy, endpoint parsing, credentials, or message limits                                       | `src/Worker.ts`, `src/GrpcClient.ts`, `worker.config.json`                                                                                            |
| executable-code boundary       | expand app roots/globs, alter path canonicalization, module resolution, export selection, require/import interception                        | `src/startApp.ts`, `src/loadScriptFile.ts`, `src/LegacyFunctionLoader.ts`, `src/setupCoreModule.ts`                                                   |
| app/process isolation          | change what resets or survives specialization, environment replacement, working directory, module/global state                               | `src/WorkerContext.ts`, `src/AppContext.ts`, `src/eventHandlers/FunctionEnvironmentReloadHandler.ts`                                                  |
| invocation contract            | alter indexing mode, registration lock, programming-model selection, binding/typed-data interpretation, output semantics                     | `src/coreApi/`, `src/eventHandlers/FunctionsMetadataHandler.ts`, `src/eventHandlers/FunctionLoadHandler.ts`, `src/eventHandlers/InvocationHandler.ts` |
| lifecycle guarantees           | change hook ordering/error policy, retry/timeout behavior, stream closure, shutdown, or process exit                                         | `src/hooks/`, `src/eventHandlers/terminateWorker.ts`, `src/utils/blockedMonitor.ts`                                                                   |
| disclosure policy              | reduce or redefine sanitization, error classification, user/system log separation                                                            | `src/errors.ts`, `src/utils/errorSanitizer.ts`, `src/utils/Logger.ts`, `src/WorkerContext.ts`, `src/coreApi/coreApiLog.ts`                            |
| shipped artifact               | add/update a runtime dependency, lifecycle script, generator, bundle external, package content, worker command, or release pipeline behavior | `package.json`, lockfiles, `scripts/`, `webpack.config.js`, `Worker.nuspec`, `worker.config.json`, `azure-pipelines/`                                 |

Examples that require Gate A:

- adding a Host message or worker capability
- deciding that an absolute or UNC `scriptFile` is valid or invalid
- changing which environment variables survive specialization
- adding a timeout that can terminate app hooks or in-flight invocations
- changing HTTP/TLS endpoint acceptance
- changing `TypedData` encoding or HTTP response representation
- updating `@grpc/grpc-js`, `protobufjs`, `@azure/functions`, or generation tooling for the shipped worker

The human decision should cite the compatibility/security policy, supported versions, and rollout behavior.

## Gate B: Human Review Before Acceptance

Use Gate B when the established contract remains fixed but implementation changes can violate it, including:

- refactoring dispatch or a handler while preserving message shapes
- fixing retries or ESM/CommonJS loading without expanding valid targets
- changing converters while preserving documented binding semantics
- changing hook execution implementation without changing ordering or error policy
- optimizing hot invocation code, allocations, or blocked-event-loop monitoring
- extending secret patterns without reducing existing coverage
- adding validation that enforces an already documented Host invariant
- changing tests or fixtures that encode a critical contract

Gate B requires a focused regression plus broad repository validation. Security-sensitive cases also require the security skill's source-to-sink analysis.

## Dependency Upgrade Requirements

For upgrades affecting critical-path dependencies:

- Review upstream release notes, changelogs, and the source diff when available.
- Identify breaking changes, behavior changes, and security fixes.
- Document which upstream changes may affect the Node.js worker.
- Map each relevant behavior change to validation evidence or regression tests.
- Record the source and target versions reviewed.
- If upstream documentation or source history is unavailable, mark the dependency analysis incomplete.

## Not Gated by This Skill

Examples normally outside this gate, provided they do not mask a critical behavior change:

- spelling-only documentation changes
- test naming or formatting with identical assertions
- internal utility changes with no lifecycle, protocol, loading, process, diagnostic, dependency, or artifact effect
- generated-file changes that exactly reproduce an already approved `.proto` source change; the source change itself remains gated

When generated output changes unexpectedly, escalate rather than classify it as harmless.

## Cross-Repository Review

Require evidence or ownership input from related repositories when changing shared behavior:

- `azure-functions-host` for RPC messages, capabilities, startup, and lifecycle contracts
- `azure-functions-nodejs-library` for programming-model and core API behavior
- `azure-functions-nodejs-extensions` for extension integration and Azure resource binding behavior
- `azure-functions-nodejs-e2e-tests` for ecosystem compatibility coverage
- `azure-functions-core-tools` for local Host startup and debugging behavior

A worker-only unit test is necessary but not sufficient for a shared contract change.

## Human Review Questions

Select only questions relevant to the change:

- Is the current behavior documented or accidental?
- Which Host, worker, Node.js, and programming-model versions must interoperate?
- Does the Host validate this value before sending it, and where is that guarantee tested?
- Is process-wide state intended to survive warm invocation, reload, or specialization?
- What is the expected behavior on partial failure, cancellation, timeout, or concurrent work?
- Could the change alter what code executes or what data reaches logs?
- Are generated, bundled, NuGet, and pipeline artifacts consistent with the reviewed source?
- Which cross-repository tests and rollout controls are required?

Record answers in the review packet. An unanswered contract question remains a blocking item for Gate A.
