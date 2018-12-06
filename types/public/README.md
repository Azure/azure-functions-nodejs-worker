# Type definitions for Azure Functions
These are type definitions for using TypeScript with Azure Functions.

Although Azure Functions does not directly support functions written in TypeScript, running transpiled functions is supported. Read more [here](https://docs.microsoft.com/azure/azure-functions/functions-reference-node#configure-function-entry-point) on configuring the location and name of your Azure Function. 

# Install
Because this package only contains TypeScript type definitions, it should be saved under `devDependencies`.

`npm install @azure/functions --save-dev`

# Usage
```javascript
import { IFunction, IContext, IRequest} from "@azure/functions";

const index: IFunction = async function (context: IContext, req: IRequest) {
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
For developing Azure Functions to run on Node.js, it is recommended that you use Visual Studio Code as your IDE. You can follow this tutorial to [create and deploy your first JavaScript function](https://docs.microsoft.com/azure/azure-functions/functions-create-first-function-vs-code).

The [Azure Functions developer guide](https://docs.microsoft.com/azure/azure-functions/functions-reference) and the[JavaScrip-specific developer guide](https://docs.microsoft.com/azure/azure-functions/functions-reference-node) are good resources for understanding more involved development.


