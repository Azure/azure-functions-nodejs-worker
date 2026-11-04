# Azure Functions Node.js Worker

|Branch|Status|[Runtime Version](https://docs.microsoft.com/azure/azure-functions/functions-versions)|Support level|Node.js Versions|
|---|---|---|---|---|
|v3.x (default)|[![Build Status](https://img.shields.io/azure-devops/build/azfunc/public/527/v3.x)](https://azfunc.visualstudio.com/public/_build/latest?definitionId=527&branchName=v3.x) [![Test Status](https://img.shields.io/azure-devops/tests/azfunc/public/527/v3.x?compact_message)](https://azfunc.visualstudio.com/public/_build/latest?definitionId=527&branchName=v3.x)|4|GA|26, 24, 22|

> NOTE: The branch corresponds to the _worker_ version, which is intentionally decoupled from the _runtime_ version.

## Getting Started

- [Create your first Node.js function](https://docs.microsoft.com/azure/azure-functions/create-first-function-vs-code-node)
- [Node.js developer guide](https://docs.microsoft.com/azure/azure-functions/functions-reference-node)
- [Language Extensibility Wiki](https://github.com/Azure/azure-webjobs-sdk-script/wiki/Language-Extensibility)

## Contributing

- Clone the repository locally and open in VS Code
- Run "Extensions: Show Recommended Extensions" from the [command palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette) and install all extensions listed under "Workspace Recommendations"
- Run `npm install` and `npm run build`
- Create or open a local function app to test with
- In the local function app, add the following settings to your "local.settings.json" file or configure them directly as environment variables
  - `languageWorkers__node__workerDirectory`: `<path to the root of this repository>`
  - `languageWorkers__node__arguments`: `--inspect`
    > 💡 Tip #1: Set `logging__logLevel__Worker` to `debug` if you want to view worker-specific logs in the output of `func start`

    > 💡 Tip #2: If you need to debug worker initialization, use `--inspect-brk` instead of `--inspect`. Just keep in mind you need to attach the debugger within 30 seconds or the host process will timeout.
- Start the local function app (i.e. run `func start` or press <kbd>F5</kbd>)
- Back in the worker repository, press <kbd>F5</kbd> and select the process for your running function app
- Before you submit a PR, run `npm run lint` and `npm test` and fix any issues. If you want to debug the tests, switch your [launch profile](https://code.visualstudio.com/docs/editor/debugging) in VS Code to "Launch Unit Tests" and press <kbd>F5</kbd>.

## Host configuration delivery

When `WorkerInitRequest.capabilities["HostConfiguration"]` is exactly `"1"`, the worker
captures `host.json` beneath its local `FUNCTIONS_APPLICATION_DIRECTORY` and attaches
`WorkerInitResponse.host_configuration`. The launcher must provide this environment
variable before enabled initialization. Neither the Host's `function_app_directory`,
`AzureWebJobsScriptRoot`, nor the current directory is a fallback. Explicit relative
roots use filesystem path resolution. The repository's Host sanity launcher does not
set `FUNCTIONS_APPLICATION_DIRECTORY`; platform provisioning must be verified separately.

The snapshot is lazy and shared across concurrent/repeated initialization requests for
the current app generation, including failures. Specialization creates a new generation.
Unrequested initialization performs no configuration lookup or I/O. There are no live
rereads or retries of cached failures.

Delivery converts strict UTF-8 (default) or BOM-marked UTF-8, UTF-16 LE/BE, or UTF-32
LE/BE incrementally to BOM-free UTF-8. Both the converted source (before parsing)
and normalized output are limited to 65,536 bytes. Input must contain one JSON object
root, with at most 64 nested containers including that root. Empty or BOM-only files,
non-object roots, whitespace/comment-only input, and malformed JSON return content-free
Error with reason `InvalidJson`. An empty object (`{}`) is valid, as are arrays and
scalars nested inside an object. Normalization removes `//` and `/* */` comments and
trailing commas while preserving raw string/number tokens, escapes, duplicate keys,
and key order.

Missing files, acquisition/conversion/JSON errors, and oversized output have distinct
content-free outcomes. Each cached failure emits one system warning with a fixed
reason code, never a path, exception message, or file content. Available and Missing
outcomes and cache replays emit no warning. These outcomes do not replace the existing
worker-init result. The Host still owns settings validation, defaults, and
`AzureFunctionsJobHost__` overrides. Node uses fatal decoders and accepts legitimately
encoded U+FFFD; it does not use replacement-character detection to infer encoding errors.

The vendored APP-01 fields and comments come from
[Azure/azure-functions-language-worker-protobuf#103](https://github.com/Azure/azure-functions-language-worker-protobuf/pull/103),
commit `313666583af4e97f0b534f1cbf61a3812f277c12`; unrelated newer protocol fields are not
imported. The behavioral reference is
[Azure/azure-functions-dotnet-worker#3522](https://github.com/Azure/azure-functions-dotnet-worker/pull/3522),
commit `e7765e7201008340e4cc407486bbd31649abf162`, including its object-root validation,
compact-normalization, and cached-failure diagnostic behavior. Regenerate the vendored bindings
with `npm run gen` (also run by `npm run build`); generated RPC files are not edited
manually. Integration requires the compatible Host receiver and an opaque proxy path.

## Repositories

These are the most important GitHub repositories that make up the Node.js experience on Azure Functions:

- [azure-functions-nodejs-library](https://github.com/Azure/azure-functions-nodejs-library): The `@azure/functions` [npm package](https://www.npmjs.com/package/@azure/functions) that you include in your app.
- [azure-functions-nodejs-worker](https://github.com/Azure/azure-functions-nodejs-worker): The other half of the Node.js experience that ships directly in Azure.
- [azure-functions-nodejs-e2e-tests](https://github.com/Azure/azure-functions-nodejs-e2e-tests): A set of automated end-to-end tests designed to run against prerelease versions of all Node.js components.
- [azure-functions-host](https://github.com/Azure/azure-functions-host): The runtime shared by all languages in Azure Functions.
- [azure-functions-core-tools](https://github.com/Azure/azure-functions-core-tools): The CLI used to test Azure Functions locally.

### Code of Conduct

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

### Contributing to TypeScript type definitions

The type definitions supplied by the `@azure/functions` [npm package](https://www.npmjs.com/package/@azure/functions) are located in the `types` folder. Any changes should be applied directly to `./types/index.d.ts`. Please make sure to update the tests in `./types/index.test.ts` as well.
