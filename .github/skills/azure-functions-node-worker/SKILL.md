---
name: azure-functions-node-worker
description: 'Repository-specific Azure Functions Node.js Host-worker architecture and change-validation workflow. Use for every implementation, fix, refactor, test, or explanation involving this repository, especially worker startup, gRPC StreamingMessage handling, initialization, specialization, metadata/indexing, function loading and invocation, programming models, hooks, converters, logging, process lifecycle, Node.js behavior, protobuf, build, or tests. Validate each code change against Host compatibility and Node runtime invariants.'
argument-hint: '[change, file, or behavior]'
---

# Azure Functions Node.js Worker

Apply this skill to code changes in this repository. It supplies domain context and a mandatory validation workflow; it does not replace focused security analysis or required human review.

Read [architecture.md](./references/architecture.md) before reasoning about behavior that crosses the Host-worker boundary or more than one lifecycle stage.

## Core Model

Treat this repository as the process boundary between the Azure Functions Host and a user's Node.js function application:

1. `src/nodejsWorker.ts` enters the worker and `src/Worker.ts` parses Host-provided startup arguments.
2. `src/GrpcClient.ts` creates the bidirectional gRPC stream.
3. `src/setupEventStream.ts` routes Host `StreamingMessage` requests to event handlers and constructs protocol responses.
4. Initialization or specialization loads the function app and establishes process-wide state in `WorkerContext` and `AppContext`.
5. Metadata/load handlers select worker indexing or legacy Host indexing.
6. `InvocationHandler` bridges RPC data to the active `@azure/functions` programming model, runs hooks, invokes user code, and converts the response.
7. Termination runs app hooks, closes the stream, and exits the process.

The Host, worker, programming model, and function app are separate compatibility surfaces. Do not reason about one in isolation when a change crosses their boundary.

## Required Workflow

### 1. Classify the Change

Identify all affected surfaces before editing:

- Host RPC contract or message routing
- worker startup, state, or lifecycle
- function app discovery or module loading
- programming model or core API bridge
- invocation bindings or typed-data conversion
- hooks, logging, errors, or diagnostics
- Node.js runtime, event loop, environment, working directory, or process exit
- generated protobuf, packaging, dependencies, or release configuration

If any critical path is affected, also load `azure-functions-node-worker-critical-path`. If data crosses a trust boundary, executable content is loaded, credentials may be exposed, or dependencies change, also load `azure-functions-node-worker-security`.

### 2. Trace the Owning Path

Start at the code that directly decides behavior. Trace only the relevant path:

`Host input -> StreamingMessage -> handler -> worker/app state or programming model -> response/log/side effect`

State the local invariant being preserved and a cheap test that could falsify the proposed behavior. Do not edit generated `rpc.js`, `rpc_static.js`, or `rpc.d.ts` directly. Protocol changes start in `azure-functions-language-worker-protobuf/src/proto/` and regenerate outputs with `npm run gen`.

### 3. Preserve Domain Invariants

For every change, verify the applicable invariants:

- Every handled request retains its `requestId`, expected response property, and `StatusResult` semantics.
- Handler failures are returned through the common event-stream error path; host-bound error text remains sanitized.
- `setupEventStream()` and `setupCoreModule()` are established before user app code depends on them.
- Worker state is process-wide. Specialization resets app state without accidentally reinitializing the worker identity or stream.
- Worker indexing and legacy Host indexing remain distinct; registration locks are not weakened.
- Invocation input/output conversion remains symmetric with the programming-model contract.
- Pre- and post-invocation hooks retain ordering and documented mutation behavior.
- User code loading preserves CommonJS and ESM behavior, package `main` handling, retry behavior, and entry-point error policy.
- Code does not assume gRPC requests or invocations are serialized. Avoid blocking the Node.js event loop and unbounded synchronous work.
- Changes to `process.env`, `process.cwd()`, module caches, listeners, timers, and process exit account for process-wide effects and test cleanup.
- Logs keep system/user category semantics and do not bypass error or secret sanitization.
- Generated protocol outputs match their `.proto` sources and are reviewed as generated artifacts.

### 4. Implement and Test the Behavior

Keep the change at the owning abstraction. Add or update the nearest test that observes the externally meaningful result, not only an internal call.

Use the test map in [architecture.md](./references/architecture.md). Prefer the smallest executable check first, for example:

```powershell
npx mocha -r ts-node/register "test/Worker.test.ts"
npx mocha -r ts-node/register "test/eventHandlers/InvocationHandler.test.ts"
```

Then run the checks required by the affected surface:

```powershell
npm run lint
npm test
npm run build
```

`npm run build` regenerates protobuf outputs before compiling. Inspect those generated changes and do not accept unrelated churn.

Run `npm run host-sanity` for changes to startup arguments, gRPC behavior, protocol routing, worker configuration, module loading, or Host compatibility when the adjacent Host repository and prerequisites are available. Report clearly when that integration check cannot run.

### 5. Report Validation

Do not say a change is validated without executable evidence. Report:

- the invariant tested
- the exact focused and broad checks run
- pass/fail results
- checks not run and why
- whether security analysis or human review is required

Do not treat lint, compilation, snapshots, or generated-code verification alone as behavioral validation.

## Change-to-Validation Matrix

| Changed surface | Minimum focused validation | Broader validation |
| --- | --- | --- |
| `Worker.ts`, `GrpcClient.ts`, startup | `test/Worker.test.ts`, `test/GrpcClient.test.ts` as applicable | lint, full tests, build; Host sanity for contract changes |
| `setupEventStream.ts`, event handlers | matching `test/eventHandlers/*.test.ts` | lint, full tests, build |
| `startApp.ts`, package parsing, script loading | `test/startApp.test.ts`, `test/parsers/parsePackageJson.test.ts`, or `test/loadScriptFile.test.ts` | lint, full tests, build |
| invocation, hooks, converters | `test/eventHandlers/InvocationHandler.test.ts` plus a focused regression | lint, full tests, build |
| reload or process state | `test/eventHandlers/FunctionEnvironmentReloadHandler.test.ts` with state cleanup assertions | lint, full tests, build |
| termination | `test/eventHandlers/terminateWorker.test.ts` | lint, full tests, build |
| errors, logging, sanitization | `test/errors.test.ts` or nearest handler test | lint, full tests, build; security skill |
| blocked event loop or runtime versions | `test/blockMonitorTest.ts` or `test/utils.test.ts` | lint, full tests, build |
| `.proto` or generated RPC files | regenerate with `npm run gen`, focused handler/converter tests | lint, full tests, build, generated diff review, Host sanity |
| dependency, bundle, or packaging files | focused startup/load test | lint, full tests, build, webpack; security and human review |

## Boundaries

- Do not infer Azure Functions Host behavior solely from worker code. If compatibility depends on unspecified Host behavior, identify the assumption and require Host documentation, Host source, or an integration test.
- Do not "fix" intentional execution of function app code as though it were arbitrary code execution. The worker exists to load and run that code; security findings must show an unintended boundary expansion.
- Do not hand-edit generated protobuf outputs.
- Do not silently broaden supported Node.js versions, protocol fields, capabilities, or programming-model behavior.
- Do not claim approval for a critical-path change. Produce validation evidence and hand it to the required human reviewer.