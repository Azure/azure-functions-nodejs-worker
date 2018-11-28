// Test typescript interfaces for ts compliation errors
import * as azf from "../types/public/Interfaces";

let runHttp: azf.IFunction = async function (context: azf.IHttpContext, req: azf.IRequest) {
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

let runHttpExpressModel: azf.IFunction = async function (context: azf.IHttpContext, req: azf.IRequest) {
    if (req.query.name || (req.body && req.body.name)) {
        context.res
            .status(200)
            .header("Content-Type","text/plain")
            .send("Hello" + (req.query.name || req.body.name));
    } else {
        context.res
            .status("400")
            .send("Please pass a name on the query string or in the request body");
    }
}

let runServiceBus: azf.IFunction = function (context: azf.IContext, myQueueItem: string) { 
    context.log('Node.js ServiceBus queue trigger function processed message', myQueueItem); 
    context.log.verbose('EnqueuedTimeUtc =', context.bindingData.enqueuedTimeUtc); 
    context.log.verbose('DeliveryCount =', context.bindingData.deliveryCount); 
    context.log.verbose('MessageId =', context.bindingData.messageId); 
    context.done(); 
};

export { runHttp, runHttpExpressModel, runServiceBus };