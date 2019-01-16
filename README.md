[![Build status](https://ci.appveyor.com/api/projects/status/inqsg64h792agrji?svg=true)](https://ci.appveyor.com/project/appsvc/azure-functions-nodejs-worker/branch/dev)

## Getting Started

[Azure Functions Language Extensibility Wiki](https://github.com/Azure/azure-webjobs-sdk-script/wiki/Language-Extensibility)
[worker.config.json](https://github.com/Azure/azure-functions-host/wiki/Authoring-&-Testing-Language-Extensions#workerconfigjson)

- `git clone https://github.com/Azure/azure-functions-nodejs-worker`
- `cd azure-functions-nodejs-worker`
- `npm install`
- `npm run build`
  - Generate protobuf definitions & run typescript compiler
- `npm test`
- Add the environment variable `languageWorkers:node:workerDirectory = <path-to-nodejsWorker.js>`
  - Configure the functions host to use the development version of the worker
- To debug, add the environment variable `languageWorkers:node:arguments = --inspect-brk`

## Publishing

`package.ps1` creates the nuget package for the worker.

It builds and webpacks the generated node files into a bundle.
We include several grpc native modules, for x86/x64 versions of windows, osx, linux

The nuget package can be deployed from the appveyor job at: https://ci.appveyor.com/project/appsvc/azure-functions-nodejs-worker

## Contributing

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
