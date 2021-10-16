// Test typescript interfaces for ts compliation errors
import { Context, HttpRequest, HttpMethod, Cookie } from "../types/public/Interfaces";
import { AzureFunction } from "../types/public/ts3.1/Main";
const get: HttpMethod = "GET";

const runHttp: AzureFunction = async function (context: Context, req: HttpRequest) {
    if (req.method === get) {
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

const cookieFunction: AzureFunction = async function(context: Context) {
    let cookies: Cookie[] = [
        {
            name: "cookiename",
            value: "cookievalue",
            expires: Date.now()
        }
    ];
    context.res = {
        cookies,
        body: "just a normal body"
    };
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

export { runHttp, cookieFunction, runHttpReturn, runServiceBus, runFunction, runHttpWithQueue, returnWithContextDone };

// Function returns custom object
interface CustomOutput {
    value: string;
}
export const runTypedReturn: AzureFunction<CustomOutput> = async (context, request: HttpRequest) => {
//  return { // ts(2322) error
//      value1: "Test1"
//  };
    return {
        value: "Test"
    };
}

export const runTypedReturn1: AzureFunction<CustomOutput> = async (context, request ) => {
//  return { // ts(2322) error
//      value1: "Test1"
//  };
    return {
        value: "Test"
    };
}