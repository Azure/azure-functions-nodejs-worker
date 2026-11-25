// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

'use strict';

const entryStarted = performance.now();
const { randomUUID } = require('node:crypto');
const { hostname } = require('node:os');
const telemetry = require('@azure/functions-opentelemetry-native').enable();
if (!telemetry.enabled) {
    throw new Error('otel-coldstart: the treatment requires a working OTel package and executable.');
}
const { app } = require('@azure/functions');
const bootId = randomUUID();
const entryLoadMs = performance.now() - entryStarted;
let invocationCount = 0;

app.http('hello', {
    methods: ['GET'],
    authLevel: 'function',
    handler: (request, context) => {
        const benchmark = {
            prefix: 'otel-coldstart',
            event: 'response',
            variant: 'customer-exe',
            appName: process.env.WEBSITE_SITE_NAME ?? 'local',
            instanceId: process.env.WEBSITE_INSTANCE_ID ?? hostname(),
            bootId,
            invocationCount: ++invocationCount,
            firstInvocation: invocationCount === 1,
            workerUptimeMs: process.uptime() * 1000,
            entryLoadMs,
            otelEnabled: telemetry.enabled,
            roundId: request.headers.get('x-benchmark-round')?.slice(0, 64) ?? null,
        };
        context.log(`otel-coldstart ${JSON.stringify(benchmark)}`);
        return {
            headers: { 'cache-control': 'no-store' },
            jsonBody: { message: 'Hello World', benchmark },
        };
    },
});
