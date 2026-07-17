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

### npm registry configuration

This repository does **not** check in an `.npmrc`, so a plain `git clone` + `npm install` uses the default public npm registry (`registry.npmjs.org`). **Public contributors don't need to do anything** — this section is only relevant to Microsoft employees.

- **Configure the azfunc feed:** run `npm run setup:npmrc`. It detects your environment and writes a local, gitignored `.npmrc` pointing at the correct Azure Artifacts feed (`azfunc/public/upstream-public` locally, `azfunc/internal/upstream` in internal CI).
- **Authenticate:** run `npx better-vsts-npm-auth -c .npmrc` (one-time, refreshed periodically), then run `npm install`.
- **First-time bootstrap:** on a Microsoft machine, an `npm install` with no existing `.npmrc` runs a `preinstall` hook that writes the `.npmrc` for you and then intentionally stops the install. npm had already loaded its config before the hook ran, so it can't use the new registry yet. Just authenticate (step above) and re-run `npm install` — the second run proceeds normally. Once `.npmrc` exists, the hook is a no-op.

The generated `.npmrc` is gitignored, so it never affects public contributors or gets committed.

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
