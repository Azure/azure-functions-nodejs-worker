// Test typescript interfaces for ts compliation errors
import { AzureFunction, Context, HttpRequest, HttpMethod } from "../types/public/Interfaces";

const runHttp: AzureFunction = async function (context: Context, req: HttpRequest) {
    if (req.method == HttpMethod.GET) {
        context.log("This is a 'GET' method");
    }

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

const runServiceBus: AzureFunction = function (context: Context, myQueueItem: string) { 
    context.log('Node.js ServiceBus queue trigger function processed message', myQueueItem); 
    context.log.verbose('EnqueuedTimeUtc =', context.bindingData.enqueuedTimeUtc); 
    context.log.verbose('DeliveryCount =', context.bindingData.deliveryCount); 
    context.log.verbose('MessageId =', context.bindingData.messageId);
    context.done();
};

// Assumes output binding is named '$return'
const runHttpReturn: AzureFunction = async function (context: Context, req: HttpRequest) {
    context.log('JavaScript HTTP trigger function processed a request.');
    if (req.query.name || (req.body && req.body.name)) {
        return {
            status: "200",
            body: "Hello " + (req.query.name || req.body.name)
        };
    } else {
        return {
            status: 400,
            body: "Please pass a name on the query string or in the request body"
        };
    }
}

const runFunction: AzureFunction = async function(context: Context) {
    context.log("Ran function");
    return "Ran function";
}

const runHttpWithQueue: AzureFunction = async function (context: Context, req: HttpRequest, queueItem: Buffer) {
    context.log("Http-triggered function with " + req.method + " method.");
    context.log("Pulling in queue item " + queueItem);
    return;
}

const returnWithContextDone: AzureFunction = function (context: Context, req: HttpRequest) {
    context.log.info("Writing to queue");
    context.done(null, { myOutput: { text: 'hello there, world', noNumber: true }});
}

export { runHttp, runHttpReturn, runServiceBus, runFunction, runHttpWithQueue, returnWithContextDone };