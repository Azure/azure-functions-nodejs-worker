|Branch|Status|
|---|---|
|master|[![Build Status](https://azfunc.visualstudio.com/Azure%20Functions/_apis/build/status/Azure.azure-functions-nodejs-worker?branchName=master)](https://azfunc.visualstudio.com/Azure%20Functions/_build/latest?definitionId=10&branchName=master)|
|dev|[![Build Status](https://azfunc.visualstudio.com/Azure%20Functions/_apis/build/status/Azure.azure-functions-nodejs-worker?branchName=dev)](https://azfunc.visualstudio.com/Azure%20Functions/_build/latest?definitionId=10&branchName=dev)|

## Getting Started

[Azure Functions Language Extensibility Wiki](https://github.com/Azure/azure-webjobs-sdk-script/wiki/Language-Extensibility)
[worker.config.json](https://github.com/Azure/azure-functions-host/wiki/Authoring-&-Testing-Language-Extensions#workerconfigjson)

- `git clone https://github.com/Azure/azure-functions-nodejs-worker`
- `cd azure-functions-nodejs-worker`
- `npm install`
- `npm run build`
  - Generates protobuf definitions & runs typescript compiler
- `npm test`

## Debugging and Testing
- In the function app you are using to test, add the App Setting in local.settings.json `languageWorkers:node:workerDirectory = <path to azure-functions-nodejs-worker directory>`
  - This configures the functions host to use the development version of the worker
  - You can also configure `languageWorkers:node:workerDirectory` as an environment variable.
- To debug, add the App Setting in local.settings.json `languageWorkers:node:arguments = --inspect-brk`
  - You can also configure `languageWorkers:node:arguments` as an environment variable.

Make sure that `languageWorkers:node:workerDirectory` and `languageWorkers:node:arguments` are set correctly. When you start your functions host, you should see your custom path to workerDirectory and any arguments you passed to the node. If it was **not set** correctly, your output may look like the default output: `Starting language worker process:node  "%userprofile%\AppData\Roaming\npm\node_modules\azure-functions-core-tools\bin\workers\node\dist/src/nodejsWorker.js" --host 127.0.0.1 --port 5134 --workerId fd9b17c3-8ffb-49f7-a4e3-089a780e7a00 --requestId 14e27374-9395-42d4-a639-bd67e0e770a4 --grpcMaxMessageLength 134217728`

Read more on local debugging [in our docs](https://docs.microsoft.com/azure/azure-functions/functions-reference-node#local-debugging).

## Publishing

`package.ps1` creates the nuget package for the worker.

It builds and webpacks the generated node files into a bundle.
We include several grpc native modules, for x86/x64 versions of windows, osx, linux

The nuget package can be deployed from the appveyor job at: https://ci.appveyor.com/project/appsvc/azure-functions-nodejs-worker

## Contributing

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

### Contributing to TypeScript type definitions

`types/public/Interfaces.d.ts` is a generated file from `src/public/Interfaces.ts`. If you want to add a change to `Interfaces.d.ts`, please make the change first to `Interfaces.ts` and then `npm run build` to generate the appropriate type definitions. Any additional type definition tests should go in `test/InterfacesTest.ts`.
