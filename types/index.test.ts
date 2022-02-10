// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

// This file will be compiled by multiple versions of TypeScript as decribed in ./test/TypesTests.ts to verify there are no errors

import { AzureFunction, Context, Cookie, HttpMethod, HttpRequest, Timer } from '@azure/functions';
const get: HttpMethod = 'GET';

const runHttp: AzureFunction = async function (context: Context, req: HttpRequest) {
    if (req.method === get) {
        context.log("This is a 'GET' method");
    }

    context.log('JavaScript HTTP trigger function processed a request.');
    if (req.query.name || (req.body && req.body.name)) {
        context.res = {
            status: '200',
            body: 'Hello ' + (req.query.name || req.body.name),
        };
    } else {
        context.res = {
            status: 400,
            body: 'Please pass a name on the query string or in the request body',
        };
    }
};

export const timerTrigger: AzureFunction = async function (context: Context, myTimer: Timer): Promise<void> {
    const timeStamp = new Date().toISOString();

    if (myTimer.isPastDue) {
        context.log('Timer function is running late!');
    }
    context.log('Timer trigger function ran!', timeStamp);
};

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
            status: '200',
            body: 'Hello ' + (req.query.name || req.body.name),
        };
    } else {
        return {
            status: 400,
            body: 'Please pass a name on the query string or in the request body',
        };
    }
};

const runFunction: AzureFunction = async function (context: Context) {
    context.log('Ran function');
    return 'Ran function';
};

const cookieFunction: AzureFunction = async function (context: Context) {
    const cookies: Cookie[] = [
        {
            name: 'cookiename',
            value: 'cookievalue',
            expires: Date.now(),
        },
    ];
    context.res = {
        cookies,
        body: 'just a normal body',
    };
};

const resNumberFunction: AzureFunction = async function (context: Context) {
    context.res = {
        body: {
            hello: 'world',
        },
        status: 200,
        headers: {
            'content-type': 'application/json',
        },
    };
};

const resStringFunction: AzureFunction = async function (context: Context) {
    context.res = {
        status: '200',
    };
};

const resFuncFunction: AzureFunction = async function (context: Context) {
    if (context.res?.status instanceof Function) {
        context.res.status(200);
    }
};

const runHttpWithQueue: AzureFunction = async function (context: Context, req: HttpRequest, queueItem: Buffer) {
    context.log('Http-triggered function with ' + req.method + ' method.');
    context.log('Pulling in queue item ' + queueItem);
    return;
};

const returnWithContextDone: AzureFunction = function (context: Context, req: HttpRequest) {
    context.log.info('Writing to queue');
    context.done(null, { myOutput: { text: 'hello there, world', noNumber: true } });
};

export {
    runHttp,
    cookieFunction,
    runHttpReturn,
    runServiceBus,
    runFunction,
    runHttpWithQueue,
    returnWithContextDone,
    resNumberFunction,
    resStringFunction,
    resFuncFunction,
};

// Function returns custom object
interface CustomOutput {
    value: string;
}
export const runTypedReturn: AzureFunction = async (context, request: HttpRequest): Promise<CustomOutput> => {
    //  return { // ts(2322) error
    //      value1: "Test1"
    //  };
    return {
        value: 'Test',
    };
};

export const runTypedReturn1: AzureFunction = async (context, request): Promise<CustomOutput> => {
    //  return { // ts(2322) error
    //      value1: "Test1"
    //  };
    return {
        value: 'Test',
    };
};
