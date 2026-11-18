// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

const { app } = require('@azure/functions');

if (process.env.RUST_SAMPLE_HTTP_STREAMING === 'true') app.setup({ enableHttpStream: true });

app.http('hello', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const body = request.method === 'POST' ? await request.text() : '';
        const name = request.query.get('name') || body || 'world';
        context.log(`Hello function called for "${name}"`);
        return { body: `Hello, ${name}!` };
    },
});

// Shows the trace context the Rust worker passed to the handler.
app.http('trace', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (_request, context) => ({
        jsonBody: {
            invocationId: context.invocationId,
            traceParent: context.traceContext?.traceParent ?? null,
            traceState: context.traceContext?.traceState ?? null,
        },
    }),
});

app.http('failure', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async () => {
        throw new Error('Deliberate sample failure');
    },
});
