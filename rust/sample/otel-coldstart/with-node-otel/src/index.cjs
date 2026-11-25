// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

'use strict';

const entryStarted = performance.now();
const { randomUUID } = require('node:crypto');
const { hostname } = require('node:os');
const { sdk, context: otelContext, propagation, trace, logs, SpanKind, SeverityNumber, logEnabled } = require('./telemetry.cjs');
const { app } = require('@azure/functions');
const bootId = randomUUID();
const entryLoadMs = performance.now() - entryStarted;
const tracer = trace.getTracer('otel-coldstart');
const logger = logs.getLogger('otel-coldstart');
let invocationCount = 0;

app.hook.appTerminate(() => sdk.shutdown());
app.http('hello', {
    methods: ['GET'],
    authLevel: 'function',
    handler: (request, context) => {
        // Functions HTTP invocations arrive over RPC, not a Node HTTP server.
        const parent = propagation.extract(otelContext.active(), {
            traceparent: context.traceContext?.traceParent ?? request.headers.get('traceparent'),
            tracestate: context.traceContext?.traceState ?? request.headers.get('tracestate'),
        });
        return tracer.startActiveSpan('GET hello', {
            kind: SpanKind.SERVER,
            attributes: {
                'faas.name': 'hello',
                'faas.invocation_id': context.invocationId,
                'faas.trigger': 'http',
                'http.request.method': 'GET',
                'http.route': 'hello',
                'http.response.status_code': 200,
            },
        }, parent, (span) => {
            try {
                const benchmark = {
                    prefix: 'otel-coldstart',
                    event: 'response',
                    variant: 'node-otel',
                    appName: process.env.WEBSITE_SITE_NAME ?? 'local',
                    instanceId: process.env.WEBSITE_INSTANCE_ID ?? hostname(),
                    bootId,
                    invocationCount: ++invocationCount,
                    firstInvocation: invocationCount === 1,
                    workerUptimeMs: process.uptime() * 1000,
                    entryLoadMs,
                    otelEnabled: true,
                    roundId: request.headers.get('x-benchmark-round')?.slice(0, 64) ?? null,
                };
                const message = `otel-coldstart ${JSON.stringify(benchmark)}`;
                context.log(message);
                if (logEnabled) {
                    logger.emit({ body: message, severityNumber: SeverityNumber.INFO, attributes: { 'faas.name': 'hello' } });
                }
                return {
                    headers: { 'cache-control': 'no-store' },
                    jsonBody: { message: 'Hello World', benchmark },
                };
            } finally {
                span.end();
            }
        });
    },
});
