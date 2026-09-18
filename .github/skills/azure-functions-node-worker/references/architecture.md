# Architecture and Validation Reference

Use this reference when a change spans lifecycle stages or depends on Host-worker compatibility.

## System Boundaries

- Azure Functions Host: starts the worker, owns the RPC protocol, sends lifecycle and invocation messages, and consumes responses and logs.
- Node.js worker: owns the gRPC client, process lifecycle, app state, dispatch, compatibility behavior, and the bridge to the programming model.
- `@azure/functions` and `@azure/functions-core`: own the programming model used to register and invoke v4 functions.
- Function application: supplies package metadata and executable CommonJS or ESM user code.
- Language-worker protobuf: defines the shared wire contract. Generated JavaScript and TypeScript files are artifacts, not source of truth.

Related repositories include `azure-functions-host`, `azure-functions-nodejs-library`, `azure-functions-nodejs-e2e-tests`, and `azure-functions-core-tools`. A local unit test cannot prove cross-repository compatibility when the shared contract changes.

## Startup

The process starts through `src/nodejsWorker.ts` and `startNodeWorker()` in `src/Worker.ts`.

`startNodeWorker()`:

1. Parses `--functions-uri`, `--functions-worker-id`, `--functions-request-id`, and `--functions-grpc-max-message-length`.
2. Sets the worker identity.
3. Creates the gRPC event stream through `src/GrpcClient.ts`.
4. Configures event dispatch and the runtime core-module bridge.
5. Writes `startStream` with the worker ID.
6. Optionally starts blocked-event-loop monitoring.

The URI scheme and message length affect the Host connection contract. HTTP can be an intentional trusted-localhost Host configuration; do not label it insecure without showing a reachable untrusted network boundary.

## Event Stream and Lifecycle

`src/setupEventStream.ts` listens for stream data and dispatches by `StreamingMessage.content`.

| Host request                       | Owner                              | Main effect                                                                                                          |
| ---------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `workerInitRequest`                | `WorkerInitHandler`                | initializes Host/app context, starts the app, validates Node version, returns capabilities and metadata              |
| `functionEnvironmentReloadRequest` | `FunctionEnvironmentReloadHandler` | resets app state, replaces environment, may change working directory, restarts the app, returns updated capabilities |
| `functionsMetadataRequest`         | `FunctionsMetadataHandler`         | locks indexing and returns worker-indexed metadata or requests default Host indexing                                 |
| `functionLoadRequest`              | `FunctionLoadHandler`              | locks indexing and loads legacy functions when Host indexing is active                                               |
| `invocationRequest`                | `InvocationHandler`                | converts the request, runs hooks and user code, converts the response                                                |
| `workerStatusRequest`              | `setupEventStream.ts`              | returns the latency/status response without a normal handler class                                                   |
| `workerTerminate`                  | `terminateWorker.ts`               | runs terminate hooks, ends the stream, and exits without a response                                                  |

The common dispatch path builds default responses, attaches success/failure status, sanitizes errors, and verifies outgoing protobuf shape. A handler change must preserve that shared responsibility instead of duplicating it.

The stream callback starts asynchronous handling without serializing all messages. Shared state must tolerate the lifecycle ordering promised by the Host and concurrent asynchronous work; never assume that `await` in one handler blocks later stream callbacks.

## State and Specialization

`src/WorkerContext.ts` is the process-wide singleton. It owns worker identity, Host version, event stream, default programming model, and current `AppContext`.

`src/AppContext.ts` owns app-scoped data such as function registrations, hooks, package metadata, indexing state, and startup errors. `resetApp()` replaces app-scoped state during specialization/reload and restores the default programming model.

Review all mutations for effects on:

- in-flight invocations
- registered hooks and functions
- blocking app-start errors
- module cache and loaded entry points
- environment variables and working directory
- process listeners, timers, and diagnostics

Tests that mutate these globals must restore them even on failure.

## App and Function Loading

`src/startApp.ts` parses the function app's `package.json`, resolves its `main` entry-point pattern, loads matching files, and runs app-start hooks.

`src/loadScriptFile.ts` contains CommonJS/ESM loading and retry behavior. `src/LegacyFunctionLoader.ts` resolves a v3 function export from Host-provided metadata. Changes must preserve:

- package `main` and glob behavior
- deterministic entry-point ordering
- `.js`, `.cjs`, and `.mjs` behavior
- retry classification and timing
- `this` binding and entry-point selection for legacy exports
- the Node-version/programming-model policy for blocking startup errors

Loading function app code is intentional. Security analysis should focus on whether a change escapes the expected app/code boundary or changes who controls the loaded target.

## Programming Model and Invocation

`src/setupCoreModule.ts` intercepts `require('@azure/functions-core')` and exposes the worker-owned core API. Function and hook registration occurs during app startup and becomes locked when indexing begins.

For an invocation, `InvocationHandler`:

1. Resolves a worker-indexed or legacy registered function.
2. Converts RPC request and metadata to core types.
3. Obtains an invocation model from the active programming model.
4. Extracts arguments.
5. Runs pre-invocation hooks.
6. Invokes user code.
7. Runs post-invocation hooks.
8. Converts the result to an RPC response.

Changes in `src/coreApi/converters/` must account for missing/null values, binary and JSON payloads, HTTP semantics, binding names, retry metadata, and round-trip compatibility. Add boundary-value tests, not only happy paths.

## Node.js Process Semantics

This worker hosts many invocations in one long-lived Node.js process:

- Synchronous CPU or filesystem work blocks unrelated invocations and gRPC progress.
- `process.env` and the current working directory are global, mutable state.
- CommonJS and ESM have different loaders and cache behavior.
- Module state, hooks, global variables, listeners, handles, and timers can survive across invocations.
- Unhandled rejections, uncaught exceptions, and explicit process exit affect the entire worker.
- Buffers and typed data must not be converted through lossy string paths.
- Cleanup must preserve termination semantics without hanging shutdown.

Use asynchronous APIs on hot paths, bound retries and allocations, and test cleanup of process-wide mutations.

## Errors and Logs

Errors can cross from user code to worker code and then to the Host. Preserve the distinction between system and user errors, and sanitize all Host-bound messages, stacks, exception details, and startup logs that may contain secrets.

`src/utils/errorSanitizer.ts`, `src/errors.ts`, `src/utils/Logger.ts`, `src/coreApi/coreApiLog.ts`, and `WorkerContext.log()` participate in this path. Log hooks may transform user logs but must not suppress mandatory system diagnostics.

## Protocol and Generated Files

The source of truth is under `azure-functions-language-worker-protobuf/src/proto/`. `scripts/generateProtos.js` generates:

- `azure-functions-language-worker-protobuf/src/rpc.js`
- `azure-functions-language-worker-protobuf/src/rpc_static.js`
- `azure-functions-language-worker-protobuf/src/rpc.d.ts`

For protocol changes:

1. Confirm the corresponding Host contract and compatibility plan.
2. Edit `.proto` source only.
3. Run `npm run gen`.
4. Inspect every generated diff.
5. Add handler/converter tests for old and new shapes as compatibility requires.
6. Run lint, all unit tests, build, and Host/e2e integration where available.

## Focused Tests

| Behavior                           | Primary tests                                                 |
| ---------------------------------- | ------------------------------------------------------------- |
| startup arguments and stream start | `test/Worker.test.ts`                                         |
| gRPC URI/channel behavior          | `test/GrpcClient.test.ts`                                     |
| init and capabilities              | `test/eventHandlers/WorkerInitHandler.test.ts`                |
| specialization/environment         | `test/eventHandlers/FunctionEnvironmentReloadHandler.test.ts` |
| legacy loading                     | `test/eventHandlers/FunctionLoadHandler.test.ts`              |
| metadata/indexing                  | nearest metadata and invocation handler tests                 |
| invocation, bindings, hooks        | `test/eventHandlers/InvocationHandler.test.ts`                |
| termination                        | `test/eventHandlers/terminateWorker.test.ts`                  |
| app entry points                   | `test/startApp.test.ts`                                       |
| CJS/ESM and loading retries        | `test/loadScriptFile.test.ts`                                 |
| package metadata                   | `test/parsers/parsePackageJson.test.ts`                       |
| error handling/sanitization        | `test/errors.test.ts` and affected handler tests              |
| Node utility/version behavior      | `test/utils.test.ts`                                          |
| blocked event loop                 | `test/blockMonitorTest.ts`                                    |

Use `test/eventHandlers/TestEventStream.ts`, `test/eventHandlers/msg.ts`, and `test/eventHandlers/testApp/` for protocol-observable handler tests.

## Validation Levels

- Level 1, local behavior: nearest unit test or a new focused regression.
- Level 2, repository compatibility: `npm run lint`, `npm test`, and `npm run build`.
- Level 3, artifact behavior: `npm run webpack` for bundle/entry-point/packaging changes.
- Level 4, Host integration: `npm run host-sanity` with a compatible adjacent Host checkout.
- Level 5, ecosystem compatibility: nodejs-library and e2e suites when programming-model or shared RPC contracts change.

Choose the highest level demanded by risk. Always start with Level 1 after the first substantive code edit.
