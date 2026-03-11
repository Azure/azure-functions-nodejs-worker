// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { systemError } from '../utils/Logger';
import { AggregatedHealthMetric, AISummary, InvocationMetric } from './types';

/**
 * Describes the scope of an AI summary custom event.
 */
export interface AISummaryEventContext {
    /** 'invocation' for per-invocation summaries, 'window' for aggregation-window summaries */
    type: 'invocation' | 'window';
    /** Function name the summary relates to */
    functionName: string;
    /** Invocation ID (only for per-invocation summaries) */
    invocationId?: string;
    /** Trace/operation ID for App Insights correlation (only for per-invocation summaries) */
    traceId?: string;
    /** Aggregation window start (only for window summaries) */
    windowStart?: string;
    /** Aggregation window end (only for window summaries) */
    windowEnd?: string;
}

/**
 * Interface for metrics emission — enables test mocking and alternative backends.
 */
export interface IMetricsEmitter {
    emitInvocationMetric(metric: InvocationMetric): void;
    emitHealthMetric(metric: AggregatedHealthMetric): void;
    emitAISummary(summary: AISummary, context: AISummaryEventContext): void;
    flush(): Promise<void>;
}

/**
 * Telemetry item envelope for Application Insights ingestion API.
 */
interface TelemetryEnvelope {
    name: string;
    time: string;
    iKey: string;
    tags: Record<string, string>;
    data: {
        baseType: string;
        baseData: Record<string, unknown>;
    };
}

/**
 * Application Insights metrics emitter using the v2/track REST API.
 * Batches metrics and flushes periodically or when buffer reaches threshold.
 */
export class AppInsightsMetricsEmitter implements IMetricsEmitter {
    #instrumentationKey: string;
    #ingestionEndpoint: string;
    #buffer: TelemetryEnvelope[] = [];
    #flushIntervalMs: number;
    #flushTimer: ReturnType<typeof setInterval> | null = null;
    #maxBufferSize: number;

    constructor(connectionString: string, flushIntervalMs = 15000, maxBufferSize = 100) {
        const parsed = this.#parseConnectionString(connectionString);
        this.#instrumentationKey = parsed.instrumentationKey;
        this.#ingestionEndpoint = parsed.ingestionEndpoint;
        this.#flushIntervalMs = flushIntervalMs;
        this.#maxBufferSize = maxBufferSize;

        this.#flushTimer = setInterval(() => {
            void this.flush();
        }, this.#flushIntervalMs);

        if (this.#flushTimer.unref) {
            this.#flushTimer.unref();
        }
    }

    #parseConnectionString(connStr: string): {
        instrumentationKey: string;
        ingestionEndpoint: string;
    } {
        const pairs: Record<string, string> = {};
        for (const part of connStr.split(';')) {
            const eqIdx = part.indexOf('=');
            if (eqIdx > 0) {
                const key = part.substring(0, eqIdx).trim();
                const value = part.substring(eqIdx + 1).trim();
                pairs[key] = value;
            }
        }

        const iKey = pairs['InstrumentationKey'];
        if (!iKey) {
            throw new Error('Application Insights connection string must contain InstrumentationKey.');
        }

        let endpoint = pairs['IngestionEndpoint'] || 'https://dc.services.visualstudio.com';
        if (endpoint.endsWith('/')) {
            endpoint = endpoint.slice(0, -1);
        }

        return {
            instrumentationKey: iKey,
            ingestionEndpoint: endpoint,
        };
    }

    emitInvocationMetric(metric: InvocationMetric): void {
        const envelope: TelemetryEnvelope = {
            name: 'Microsoft.ApplicationInsights.Event',
            time: metric.timestamp,
            iKey: this.#instrumentationKey,
            tags: {
                'ai.operation.id': metric.traceId,
                'ai.operation.name': metric.functionName,
            },
            data: {
                baseType: 'EventData',
                baseData: {
                    name: 'FunctionInvocationMetric',
                    properties: {
                        functionName: metric.functionName,
                        invocationId: metric.invocationId,
                        traceId: metric.traceId,
                        outcome: metric.outcome,
                        durationMs: metric.durationMs,
                        logCount: metric.logCount,
                        errorCount: metric.errorCount,
                        workerVersion: metric.workerVersion,
                        ...(metric.errorFingerprint && { errorFingerprint: metric.errorFingerprint }),
                        ...(metric.alertType && { alertType: metric.alertType }),
                        ...(metric.blobUri && { blobUri: metric.blobUri }),
                    },
                    measurements: {
                        durationMs: metric.durationMs,
                        logCount: metric.logCount,
                        errorCount: metric.errorCount,
                        outcome: metric.outcome,
                    },
                },
            },
        };

        this.#buffer.push(envelope);

        if (this.#buffer.length >= this.#maxBufferSize) {
            void this.flush();
        }
    }

    emitHealthMetric(metric: AggregatedHealthMetric): void {
        const envelope: TelemetryEnvelope = {
            name: 'Microsoft.ApplicationInsights.Event',
            time: new Date().toISOString(),
            iKey: this.#instrumentationKey,
            tags: {
                'ai.operation.name': metric.functionName,
            },
            data: {
                baseType: 'EventData',
                baseData: {
                    name: 'FunctionHealthMetric',
                    properties: {
                        functionName: metric.functionName,
                        windowStart: metric.windowStart,
                        windowEnd: metric.windowEnd,
                    },
                    measurements: {
                        invocationCount: metric.invocationCount,
                        successCount: metric.successCount,
                        failureCount: metric.failureCount,
                        successRate: metric.successRate,
                        errorRate: metric.errorRate,
                        durationP50: metric.durationP50,
                        durationP95: metric.durationP95,
                        durationP99: metric.durationP99,
                        totalLogCount: metric.totalLogCount,
                        totalErrorCount: metric.totalErrorCount,
                    },
                },
            },
        };

        this.#buffer.push(envelope);
    }

    emitAISummary(summary: AISummary, context: AISummaryEventContext): void {
        const eventName = context.type === 'invocation' ? 'FunctionInvocationAISummary' : 'FunctionWindowAISummary';

        const tags: Record<string, string> = {};
        if (context.traceId) {
            tags['ai.operation.id'] = context.traceId;
        }
        tags['ai.operation.name'] = context.functionName;

        const properties: Record<string, unknown> = {
            functionName: context.functionName,
            summary: summary.summary,
            prompts: JSON.stringify(summary.prompts),
            generatedAt: summary.generatedAt,
        };

        if (context.invocationId) {
            properties.invocationId = context.invocationId;
        }
        if (context.windowStart) {
            properties.windowStart = context.windowStart;
        }
        if (context.windowEnd) {
            properties.windowEnd = context.windowEnd;
        }

        const envelope: TelemetryEnvelope = {
            name: 'Microsoft.ApplicationInsights.Event',
            time: summary.generatedAt,
            iKey: this.#instrumentationKey,
            tags,
            data: {
                baseType: 'EventData',
                baseData: {
                    name: eventName,
                    properties,
                },
            },
        };

        this.#buffer.push(envelope);
    }

    async flush(): Promise<void> {
        if (this.#buffer.length === 0) {
            return;
        }

        const batch = this.#buffer.splice(0);

        try {
            const payload = batch.map((e) => JSON.stringify(e)).join('\n');
            const url = `${this.#ingestionEndpoint}/v2/track`;

            const { request: httpsRequest } = await import('https');

            await new Promise<void>((resolve, _reject) => {
                const parsedUrl = new URL(url);
                const req = httpsRequest(
                    {
                        hostname: parsedUrl.hostname,
                        path: parsedUrl.pathname,
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-json-stream',
                            'Content-Length': Buffer.byteLength(payload),
                        },
                    },
                    (res) => {
                        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                            resolve();
                        } else {
                            let body = '';
                            res.on('data', (chunk: Buffer) => (body += chunk.toString()));
                            res.on('end', () => {
                                systemError(`App Insights metric flush failed (${res.statusCode}): ${body}`);
                                this.#buffer.unshift(...batch);
                                resolve();
                            });
                        }
                        res.resume();
                    }
                );
                req.on('error', (err) => {
                    systemError('App Insights metric flush network error:', err);
                    this.#buffer.unshift(...batch);
                    resolve();
                });
                req.write(payload);
                req.end();
            });
        } catch (err) {
            systemError('App Insights metric flush exception:', err);
            this.#buffer.unshift(...batch);
        }
    }

    dispose(): void {
        if (this.#flushTimer) {
            clearInterval(this.#flushTimer);
            this.#flushTimer = null;
        }
    }
}

/**
 * No-op metrics emitter for when the pipeline is disabled.
 */
export class NoOpMetricsEmitter implements IMetricsEmitter {
    emitInvocationMetric(_metric: InvocationMetric): void {
        // no-op
    }

    emitHealthMetric(_metric: AggregatedHealthMetric): void {
        // no-op
    }

    emitAISummary(_summary: AISummary, _context: AISummaryEventContext): void {
        // no-op
    }

    async flush(): Promise<void> {
        // no-op
    }
}
