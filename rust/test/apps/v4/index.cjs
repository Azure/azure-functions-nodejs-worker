// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

const { app, input, output } = require('@azure/functions');
const { context: otelContext, trace } = require('@opentelemetry/api');

if (process.env.RUST_TEST_STREAMING === 'true') app.setup({ enableHttpStream: true });

app.hook.appStart((context) => {
    context.hookData.started = true;
    console.error('fixture:started');
});
app.hook.preInvocation((context) => {
    context.hookData.pre = true;
});
app.hook.postInvocation((context) => {
    if (context.result?.jsonBody) context.result.headers = { 'x-hook': String(context.hookData.pre) };
});
app.hook.log((context) => {
    context.message = `hook:${context.message}`;
});
app.hook.appTerminate(() => console.error('fixture:terminated'));

app.http('hello', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    route: 'users/{name?}',
    handler: async (request, context) => {
        await new Promise((resolve) => setTimeout(resolve, Number(request.query.get('delay') ?? 0)));
        context.log('fixture:hello');
        const active = trace.getSpanContext(otelContext.active());
        return {
            jsonBody: {
                name: request.query.get('name') ?? request.params.name ?? 'world',
                traceContext: context.traceContext,
                active: active ? { traceId: active.traceId, spanId: active.spanId } : null,
                body: request.method === 'POST' ? await request.text() : null,
            },
        };
    },
});
app.http('failure', {
    authLevel: 'anonymous',
    handler: async () => {
        throw new Error('fixture:error');
    },
});
app.http('crash', {
    authLevel: 'anonymous',
    handler: async () => {
        process.exit(17);
    },
});
app.http('binary', { authLevel: 'anonymous', handler: async () => ({ body: Buffer.from([0, 255, 128, 1]) }) });
app.http('outbound', {
    authLevel: 'anonymous',
    handler: async (request) => {
        const target = request.query.get('target');
        const viaHttp = await new Promise((resolve, reject) =>
            require('node:http')
                .get(`${target}/http`, (response) => {
                    let text = '';
                    response.on('data', (chunk) => (text += chunk));
                    response.on('end', () => resolve(JSON.parse(text)));
                })
                .on('error', reject)
        );
        const viaFetch = await (await fetch(`${target}/fetch?sig=secret`)).json();
        await require('node:dns').promises.lookup('localhost');
        return { jsonBody: { http: viaHttp.traceparent ?? null, fetch: viaFetch.traceparent ?? null } };
    },
});
const extraInput = input.generic({ type: 'blob', path: 'input' });
const extraOutput = output.generic({ type: 'queue', queueName: 'out' });
app.generic('bindings', {
    trigger: { type: 'queueTrigger', name: 'queue', queueName: 'input' },
    extraInputs: [extraInput],
    extraOutputs: [extraOutput],
    retry: { strategy: 'fixedDelay', maxRetryCount: 3, delayInterval: 1000 },
    handler: async (event, context) => {
        context.extraOutputs.set(extraOutput, Buffer.from([0, 255, 128]));
        return { event, extra: context.extraInputs.get(extraInput), retry: context.retryContext };
    },
});
