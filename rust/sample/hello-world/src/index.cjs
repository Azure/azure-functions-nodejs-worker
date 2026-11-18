// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

const { app } = require('@azure/functions');

app.http('hello', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const name = request.query.get('name') ?? 'world';
        context.log(`Hello function called for "${name}"`);
        return { body: `Hello, ${name}!` };
    },
});
