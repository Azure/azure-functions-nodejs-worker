// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

'use strict';

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { ConsoleSpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace');
const { ConsoleLogRecordExporter, SimpleLogRecordProcessor } = require('@opentelemetry/sdk-logs');
const { context, propagation, trace, logs, SpanKind, SeverityNumber } = require('@opentelemetry/api');

if (process.env.OTEL_SDK_DISABLED?.toLowerCase() === 'true') {
    throw new Error('otel-coldstart: the Node OTel treatment requires an enabled SDK.');
}

const selected = new Set(
    (process.env.OTEL_NODE_ENABLED_INSTRUMENTATIONS ?? '').split(',').map((name) => name.trim()).filter(Boolean)
);
const instrumentations = [];
for (const name of selected) {
    switch (name) {
        case 'http':
            instrumentations.push(new (require('@opentelemetry/instrumentation-http').HttpInstrumentation)());
            break;
        case 'dns':
            instrumentations.push(new (require('@opentelemetry/instrumentation-dns').DnsInstrumentation)());
            break;
        case 'fetch':
            instrumentations.push(new (require('@opentelemetry/instrumentation-undici').UndiciInstrumentation)());
            break;
        case 'logs':
            break;
        default:
            throw new Error(`otel-coldstart: unsupported Node instrumentation '${name}'.`);
    }
}

const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'otel-coldstart-node',
    instrumentations,
    spanProcessors: [new SimpleSpanProcessor({ exporter: new ConsoleSpanExporter() })],
    logRecordProcessors: selected.has('logs') ? [new SimpleLogRecordProcessor({ exporter: new ConsoleLogRecordExporter() })] : [],
    metricReaders: [],
});
sdk.start();
console.log(`[node-otel] ready exporter=console instrumentations=${[...selected].join(',')}`);

module.exports = { sdk, context, propagation, trace, logs, SpanKind, SeverityNumber, logEnabled: selected.has('logs') };
