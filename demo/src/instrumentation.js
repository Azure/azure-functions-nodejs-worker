/**
 * instrumentation.js
 *
 * OpenTelemetry setup — must be loaded BEFORE any other modules so the
 * HTTP instrumentation can monkey-patch Node's http/https modules.
 *
 * The Azure Functions v4 programming model lets us register this via
 * the "main" field in package.json or by requiring it in each function file.
 *
 * Traces are exported to Application Insights via the Azure Monitor exporter.
 * Console span output is disabled to avoid noise in the Functions host logs.
 */

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { Resource } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');
const { AzureMonitorTraceExporter } = require('@azure/monitor-opentelemetry-exporter');
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-node');
const { NoopSpanProcessor } = require('@opentelemetry/sdk-trace-base');

// ── Build exporters ──────────────────────────────────────────────────────────
const spanProcessors = [];

// If App Insights connection string is available, export there
const aiConnectionString =
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING ||
    process.env.AZURE_FUNCTIONS_METRICS_PIPELINE_APPINSIGHTS_CONNECTION_STRING;

if (aiConnectionString) {
    try {
        const azureExporter = new AzureMonitorTraceExporter({
            connectionString: aiConnectionString,
        });
        spanProcessors.push(new BatchSpanProcessor(azureExporter));
    } catch (err) {
        // Silently skip — the pipeline handles App Insights separately
    }
}

// If no exporters configured, use a no-op processor to prevent the SDK
// from falling back to a default ConsoleSpanExporter
if (spanProcessors.length === 0) {
    spanProcessors.push(new NoopSpanProcessor());
}

// ── Initialize the SDK ──────────────────────────────────────────────────────
const sdk = new NodeSDK({
    resource: new Resource({
        [ATTR_SERVICE_NAME]: 'pipeline-demo',
        [ATTR_SERVICE_VERSION]: '1.0.0',
    }),
    spanProcessors,
    instrumentations: [
        new HttpInstrumentation({
            requestHook: (span, request) => {
                span.setAttribute('http.request.host', request.hostname || request.host || '');
            },
        }),
    ],
});

sdk.start();

// Graceful shutdown
process.on('SIGTERM', () => {
    sdk.shutdown().catch(() => {});
});

module.exports = { sdk };
