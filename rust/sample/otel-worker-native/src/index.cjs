// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

// No OpenTelemetry packages or setup code: the Rust worker traces these calls
// because local.settings.json sets OTEL_WORKER_DEFAULT and OTEL_WORKER_ENABLE.
const { app } = require('@azure/functions');
const dns = require('node:dns');
const http = require('node:http');

function httpGet(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (response) => {
            let body = '';
            response.on('data', (chunk) => (body += chunk));
            response.on('end', () => resolve({ status: response.statusCode, body }));
        }).on('error', reject);
    });
}

app.http('downstream', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const traceparent = request.headers.get('traceparent');
        context.log(`downstream received traceparent ${traceparent}`);
        return { jsonBody: { traceparent } };
    },
});

app.http('outbound', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const origin = new URL(request.url).origin;
        const address = await dns.promises.lookup('localhost');
        const viaHttp = await httpGet(`${origin}/api/downstream?client=http`);
        const viaFetch = await (await fetch(`${origin}/api/downstream?client=fetch`)).json();
        context.log('outbound completed http, fetch and dns calls');
        return {
            jsonBody: {
                dns: address,
                http: JSON.parse(viaHttp.body).traceparent,
                fetch: viaFetch.traceparent,
            },
        };
    },
});
