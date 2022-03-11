// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

// This file will be compiled by multiple versions of TypeScript as decribed in ./test/TypesTests.ts to verify there are no errors

/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable deprecation/deprecation */
import {
    AzureFunction,
    Context,
    Cookie,
    HttpMethod,
    HttpRequest,
    HttpResponseFull,
    HttpResponseSimple,
    Timer,
} from '@azure/functions';
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

const httpResponseSimpleFunction: AzureFunction = async function (context: Context) {
    context.res = context.res as HttpResponseSimple;
    context.res = {
        body: {
            hello: 'world',
        },
        status: 200,
        statusCode: 200,
        headers: {
            'content-type': 'application/json',
        },
        cookies: [
            {
                name: 'cookiename',
                value: 'cookievalue',
                expires: Date.now(),
            },
        ],
        enableContentNegotiation: false,
    };
};

const statusStringFunction: AzureFunction = async function (context: Context) {
    context.res = context.res as HttpResponseSimple;
    context.res = {
        status: '200',
        statusCode: '200',
    };
};

const httpResponseFullFunction: AzureFunction = async function (context: Context) {
    context.res = context.res as HttpResponseFull;
    context.res.status(200);
    context.res.setHeader('hello', 'world');
    context.res.set('hello', 'world');
    context.res.header('hello', 'world');
    const hello: string = context.res.get('hello');
    const hello2: string = context.res.getHeader('hello');
    context.res.removeHeader('hello');
    context.res.type('application/json');
    context.res.body = {
        hello,
        hello2,
    };
    context.res.cookies = [
        {
            name: 'cookiename',
            value: 'cookievalue',
            expires: Date.now(),
        },
    ];
    context.res.enableContentNegotiation = false;
};

const runHttpWithQueue: AzureFunction = async function (context: Context, req: HttpRequest, queueItem: Buffer) {
    context.log('Http-triggered function with ' + req.method + ' method.');
    context.log('Pulling in queue item ' + queueItem);
    return;
};

const returnWithContextDone: AzureFunction = function (context: Context, _req: HttpRequest) {
    context.log.info('Writing to queue');
    context.done(null, { myOutput: { text: 'hello there, world', noNumber: true } });
};

const returnWithContextDoneMethods: AzureFunction = function (context: Context, _req: HttpRequest) {
    context.res = context.res as HttpResponseFull;
    context.res.send('hello world');
    context.res.end('hello world');
    context.res.sendStatus(200);
};

const returnWithJson: AzureFunction = function (context: Context, req: HttpRequest) {
    if (context.res?.status instanceof Function) {
        context.res.status(200).json({
            hello: 'world',
        });
    }
};

export {
    runHttp,
    cookieFunction,
    httpResponseFullFunction,
    httpResponseSimpleFunction,
    statusStringFunction,
    runHttpReturn,
    runServiceBus,
    runFunction,
    runHttpWithQueue,
    returnWithContextDone,
    returnWithContextDoneMethods,
    returnWithJson,
};

// Function returns custom object
interface CustomOutput {
    value: string;
}
export const runTypedReturn: AzureFunction = async (_context, _request: HttpRequest): Promise<CustomOutput> => {
    //  return { // ts(2322) error
    //      value1: "Test1"
    //  };
    return {
        value: 'Test',
    };
};

export const runTypedReturn1: AzureFunction = async (_context, _request): Promise<CustomOutput> => {
    //  return { // ts(2322) error
    //      value1: "Test1"
    //  };
    return {
        value: 'Test',
    };
};
