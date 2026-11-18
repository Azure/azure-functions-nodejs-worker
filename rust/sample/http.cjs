// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

const { app } = require('@azure/functions');

if (process.env.RUST_SAMPLE_HTTP_STREAMING === 'true') app.setup({ enableHttpStream: true });

app.http('hello', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log('Ordinary Node.js handler running behind a Rust worker');
        return { jsonBody: { greeting: `Hello, ${request.query.get('name') ?? 'world'}!` } };
    },
});

app.http('echo', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request) => ({ jsonBody: await request.json() }),
});

app.http('trace', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (_request, context) => ({ jsonBody: context.traceContext }),
});

app.http('failure', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async () => {
        throw new Error('Deliberate sample failure');
    },
});
