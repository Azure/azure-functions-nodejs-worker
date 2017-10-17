## Getting Started

- `git clone https://github.com/Azure/azure-functions-nodejs-worker`
- `cd azure-functions-nodejs-worker`
- `npm install`
- `npm test`
- `npm run build`
  - generate protobuf definitions & run typescript compiler
- `$env:WORKERS__NODE__PATH = <path-to-nodejsWorker.js>`
  - configure the functions host to use the development version of the worker

## Publishing

`publish.ps1` creates the nuget package for the worker.

It builds and webpacks the generated node files into a bundle.
We include several grpc native modules, for x86/x64 versions of windows, osx, linux

## Contributing

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
