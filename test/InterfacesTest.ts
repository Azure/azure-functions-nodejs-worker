// Test typescript interfaces for ts compliation errors
import { IFunction, IContext, IRequest} from "../types/public/Interfaces";

let runHttp: IFunction = async function (context: IContext, req: IRequest) {
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

let runServiceBus: IFunction = function (context: IContext, myQueueItem: string) { 
    context.log('Node.js ServiceBus queue trigger function processed message', myQueueItem); 
    context.log.verbose('EnqueuedTimeUtc =', context.bindingData.enqueuedTimeUtc); 
    context.log.verbose('DeliveryCount =', context.bindingData.deliveryCount); 
    context.log.verbose('MessageId =', context.bindingData.messageId);
    context.done();
};

// Assumes output binding is named '$return'
let runHttpReturn: IFunction = async function (context: IContext, req: IRequest) {
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

export { runHttp, runHttpReturn, runServiceBus };