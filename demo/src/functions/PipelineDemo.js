// Load OTEL instrumentation FIRST so HTTP calls are auto-traced
require('../instrumentation');

const { app } = require('@azure/functions');
const { trace, SpanStatusCode } = require('@opentelemetry/api');
const https = require('https');
const { SecretClient } = require('@azure/keyvault-secrets');
const { DefaultAzureCredential } = require('@azure/identity');

const tracer = trace.getTracer('pipeline-demo', '1.0.0');

// ── Key Vault config ────────────────────────────────────────────────────────
const KEY_VAULT_URL = process.env.KEY_VAULT_URL || 'https://specsavercoldstartweukv.vault.azure.net';
const SECRET_NAME = process.env.KEY_VAULT_SECRET_NAME || 'my-secret';

/**
 * Fetch a page via HTTPS and return status + body length.
 * The HTTP instrumentation will auto-create a child span for this call.
 */
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https
            .get(url, (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode,
                        bodyLength: Buffer.concat(chunks).length,
                        headers: {
                            'content-type': res.headers['content-type'],
                            server: res.headers['server'],
                        },
                    });
                });
            })
            .on('error', reject);
    });
}

app.http('PipelineDemo', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        // Start a custom parent span for the entire invocation
        return tracer.startActiveSpan('PipelineDemo.handler', async (span) => {
            try {
                const requestId = crypto.randomUUID();
                const shouldFail = request.query.get('fail') === 'true';
                const logCount = parseInt(request.query.get('logs') || '5', 10);

                span.setAttribute('request.id', requestId);
                span.setAttribute('request.logCount', logCount);

                // ── Generate user logs (routed to Blob Storage when pipeline is enabled) ──
                context.log(`[${requestId}] PipelineDemo invoked at ${new Date().toISOString()}`);
                context.log(`[${requestId}] Method: ${request.method}, URL: ${request.url}`);

                for (let i = 1; i <= logCount; i++) {
                    context.log(`[${requestId}] Processing step ${i}/${logCount} — payload chunk #${i}`);
                }

                // ── Step 1: Call external website (microsoft.com) ──
                let externalCallResult;
                await tracer.startActiveSpan('fetch-microsoft.com', async (fetchSpan) => {
                    try {
                        context.log(`[${requestId}] Calling https://www.microsoft.com ...`);
                        externalCallResult = await fetchUrl('https://www.microsoft.com');
                        fetchSpan.setAttribute('http.response.status_code', externalCallResult.statusCode);
                        fetchSpan.setAttribute('http.response.body_length', externalCallResult.bodyLength);
                        fetchSpan.setStatus({ code: SpanStatusCode.OK });
                        context.log(
                            `[${requestId}] microsoft.com responded: ${externalCallResult.statusCode}, body=${externalCallResult.bodyLength} bytes`
                        );
                    } catch (err) {
                        fetchSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
                        fetchSpan.recordException(err);
                        context.log(`[${requestId}] External call failed: ${err.message}`);
                        externalCallResult = { error: err.message };
                    } finally {
                        fetchSpan.end();
                    }
                });

                // ── Step 2: Fetch secret from Azure Key Vault ──
                let secretResult;
                await tracer.startActiveSpan('keyvault-get-secret', async (kvSpan) => {
                    kvSpan.setAttribute('keyvault.url', KEY_VAULT_URL);
                    kvSpan.setAttribute('keyvault.secret_name', SECRET_NAME);
                    try {
                        context.log(`[${requestId}] Fetching secret '${SECRET_NAME}' from Key Vault...`);
                        const credential = new DefaultAzureCredential();
                        const client = new SecretClient(KEY_VAULT_URL, credential);
                        const secret = await client.getSecret(SECRET_NAME);
                        secretResult = {
                            name: secret.name,
                            valueLength: secret.value ? secret.value.length : 0,
                            createdOn: secret.properties.createdOn,
                            expiresOn: secret.properties.expiresOn,
                        };
                        kvSpan.setAttribute('keyvault.secret_found', true);
                        kvSpan.setStatus({ code: SpanStatusCode.OK });
                        context.log(
                            `[${requestId}] Secret retrieved: name='${secret.name}', length=${secretResult.valueLength}`
                        );
                    } catch (err) {
                        kvSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
                        kvSpan.recordException(err);
                        context.log(`[${requestId}] Key Vault error: ${err.message}`);
                        secretResult = { error: err.message };
                    } finally {
                        kvSpan.end();
                    }
                });

                // ── Simulate failure if requested ──
                if (shouldFail) {
                    context.log(`[${requestId}] Simulating failure...`);
                    const err = new Error(`Simulated error for invocation ${requestId}`);
                    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
                    span.recordException(err);
                    throw err;
                }

                context.log(`[${requestId}] Completed successfully`);
                span.setStatus({ code: SpanStatusCode.OK });

                return {
                    status: 200,
                    jsonBody: {
                        message: 'PipelineDemo completed',
                        requestId,
                        logCount,
                        timestamp: new Date().toISOString(),
                        pipelineNote:
                            'User logs were routed to Blob Storage. Check the function-logs container in Azurite.',
                        externalCall: externalCallResult,
                        keyVault: secretResult,
                        tracing: 'OpenTelemetry spans exported — check console and Application Insights.',
                    },
                };
            } catch (err) {
                span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
                span.recordException(err);
                throw err;
            } finally {
                span.end();
            }
        });
    },
});
