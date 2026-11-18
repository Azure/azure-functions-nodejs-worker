// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

// Loaded before the function files (see "main" in package.json), so instrumentations
// are registered before any function module requires http or dns.
import { AzureFunctionsInstrumentation } from '@azure/functions-opentelemetry-instrumentation';
import { AzureMonitorLogExporter, AzureMonitorTraceExporter } from '@azure/monitor-opentelemetry-exporter';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DnsInstrumentation } from '@opentelemetry/instrumentation-dns';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
    ConsoleLogRecordExporter,
    LoggerProvider,
    LogRecordExporter,
    SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import {
    AlwaysOnSampler,
    ConsoleSpanExporter,
    NodeTracerProvider,
    SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';

// Send to Application Insights when a connection string is configured; otherwise print to the console.
const useAzureMonitor = !!process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;

// The Azure Monitor exporter targets an older sdk-logs that has no forceFlush; add a no-op so it fits the newer interface.
function azureMonitorLogExporter(): LogRecordExporter {
    const exporter = new AzureMonitorLogExporter();
    return Object.assign(exporter, { forceFlush: async () => {} }) as unknown as LogRecordExporter;
}

const resource = resourceFromAttributes({
    'service.name': process.env.OTEL_SERVICE_NAME || 'rust-worker-otel-sample',
});

const tracerProvider = new NodeTracerProvider({
    resource,
    // The local host sends unsampled traceparents (flags 00); record every trace so the sample shows spans.
    sampler: new AlwaysOnSampler(),
    spanProcessors: [
        new SimpleSpanProcessor(useAzureMonitor ? new AzureMonitorTraceExporter() : new ConsoleSpanExporter()),
    ],
});
tracerProvider.register();

const loggerProvider = new LoggerProvider({
    resource,
    processors: [
        new SimpleLogRecordProcessor({
            exporter: useAzureMonitor ? azureMonitorLogExporter() : new ConsoleLogRecordExporter(),
        }),
    ],
});

// Opt in to exactly the instrumentations this app needs instead of getNodeAutoInstrumentations().
registerInstrumentations({
    tracerProvider,
    loggerProvider,
    instrumentations: [new HttpInstrumentation(), new DnsInstrumentation(), new AzureFunctionsInstrumentation()],
});
