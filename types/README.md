# Type definitions for Azure Functions
This package contains type definitions for using TypeScript with Azure Functions.

These typings are for common objects that will be passed to your Azure Functions function code. Azure Functions supports TypeScript development, but does not support directly running TypeScript code without transpilation.

Read more on [configuring entry points](https://docs.microsoft.com/azure/azure-functions/functions-reference-node#configure-function-entry-point) in your Azure Functions function app.

# Install
Because this package only contains TypeScript type definitions, it should be saved under `devDependencies`.

`npm install @azure/functions --save-dev`

# Usage
```javascript
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

# Versions
Versioning of @azure/functions is tied to the version of the [Azure Functions Node.js Worker](https://github.com/Azure/azure-functions-nodejs-worker/releases) the types were generated from. You can find the Azure Functions Node.js Worker version of a given Function Runtime Version [here](https://github.com/Azure/azure-functions-host/releases). It is recommended that you take the latest version available.

# Getting Started with Azure Functions
If you are getting started with Azure Functions, you can follow this tutorial to [create and deploy your first JavaScript function](https://docs.microsoft.com/azure/azure-functions/functions-create-first-function-vs-code). We recommend that you use Visual Studio Code and the [Azure Functions extension](https://code.visualstudio.com/tutorials/functions-extension/getting-started).

The [Azure Functions developer guide](https://docs.microsoft.com/azure/azure-functions/functions-reference) and the [JavaScript-specific developer guide](https://docs.microsoft.com/azure/azure-functions/functions-reference-node) are good resources to gain an understanding of more Azure Functions concepts.


