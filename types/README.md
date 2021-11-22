# Type definitions for Azure Functions
This package contains type definitions for using TypeScript with Azure Functions. Follow [this tutorial](https://docs.microsoft.com/azure/azure-functions/create-first-function-vs-code-typescript) to create your first TypeScript function.

# Versioning
The version of the package matches the version of the [Node.js worker](https://github.com/Azure/azure-functions-nodejs-worker). It is recommended to install the latest version of the package matching the major version of your worker.

|Worker Version|[Runtime Version](https://docs.microsoft.com/azure/azure-functions/functions-versions)|Support level|Node.js Versions|
|---|---|---|---|
|3|4|GA (Recommended)|16 (Preview), 14|
|2|3|GA|14, 12, 10|
|1|2|GA (Maintenance mode)|10, 8|

# Install
Because this package only contains type definitions, it should be saved under `devDependencies`.

`npm install @azure/functions --save-dev`

# Usage
```typescript
import { AzureFunction, Context, HttpRequest } from "@azure/functions";

const index: AzureFunction = async function (context: Context, req: HttpRequest) {
    context.log('JavaScript HTTP trigger function processed a request.');
    if (req.query.name || (req.body && req.body.name)) {
        context.res = {
            status: "200",
            body: "Hello " + (req.query.name || req.body.name)
        };
    } else {
        context.res = {
            status: 400,
            body: "Please pass a name on the query string or in the request body"
        };
    }
}

export { index };
```

# Contributing

See "Contributing" section on the Node.js worker repo [here](https://github.com/Azure/azure-functions-nodejs-worker#contributing).
