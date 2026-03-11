// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { systemError, systemLog, systemWarn } from '../utils/Logger';
import { AISummaryClient } from './aiSummaryClient';
import { AlertDetector } from './alertDetector';
import { BlobLogWriter, NoOpBlobLogWriter, RestBlobStorageClient } from './blobLogWriter';
import { AggregatorAIConfig, HealthMetricsAggregator } from './healthMetricsAggregator';
import { InvocationMetricsCollector } from './invocationMetricsCollector';
import { AppInsightsMetricsEmitter, IMetricsEmitter, NoOpMetricsEmitter } from './metricsEmitter';
import { loadPipelineConfig, validatePipelineConfig } from './pipelineConfig';
import { InvocationMetric, PipelineConfig, RawLogPayload } from './types';

/**
 * Pipeline Orchestrator.
 *
 * Coordinates all pipeline components:
 *   1. pipeline.startInvocation(invocationId, functionName, traceId)
 *   2. pipeline.bufferLog(invocationId, level, category, message)
 *   3. pipeline.completeInvocation(invocationId, succeeded, error?)
 */
export class MetricsPipeline {
    #config: PipelineConfig;
    #collector: InvocationMetricsCollector;
    #blobWriter: BlobLogWriter;
    #metricsEmitter: IMetricsEmitter;
    #alertDetector: AlertDetector;
    #healthAggregator: HealthMetricsAggregator | null = null;
    #aiClient: AISummaryClient | null = null;
    #enabled: boolean;

    constructor() {
        this.#config = loadPipelineConfig();
        this.#enabled = this.#config.enabled;

        const warnings = validatePipelineConfig(this.#config);
        for (const w of warnings) {
            systemWarn(`[MetricsPipeline] ${w}`);
        }

        if (!this.#enabled) {
            this.#collector = new InvocationMetricsCollector();
            this.#blobWriter = new NoOpBlobLogWriter();
            this.#metricsEmitter = new NoOpMetricsEmitter();
            this.#alertDetector = new AlertDetector();
            return;
        }

        this.#collector = new InvocationMetricsCollector(this.#config.maxLogsPerInvocation);

        if (this.#config.blobConnectionString) {
            try {
                const blobClient = new RestBlobStorageClient(this.#config.blobConnectionString);
                this.#blobWriter = new BlobLogWriter(
                    blobClient,
                    this.#config.blobContainerName,
                    this.#config.compressLogs,
                    this.#config.blobUploadMaxRetries
                );
            } catch (err) {
                systemError('[MetricsPipeline] Failed to initialize Blob Storage client:', err);
                this.#blobWriter = new NoOpBlobLogWriter();
            }
        } else {
            this.#blobWriter = new NoOpBlobLogWriter();
        }

        if (this.#config.appInsightsConnectionString) {
            try {
                this.#metricsEmitter = new AppInsightsMetricsEmitter(this.#config.appInsightsConnectionString);
            } catch (err) {
                systemError('[MetricsPipeline] Failed to initialize App Insights emitter:', err);
                this.#metricsEmitter = new NoOpMetricsEmitter();
            }
        } else {
            this.#metricsEmitter = new NoOpMetricsEmitter();
        }

        this.#alertDetector = new AlertDetector(
            this.#config.spikeWindowSize,
            this.#config.spikeErrorRateThreshold,
            this.#config.cascadeThreshold
        );

        // Initialize AI summary client if configured
        if (this.#config.enableAISummaries && this.#config.aiEndpoint && this.#config.aiApiKey) {
            this.#aiClient = new AISummaryClient(
                this.#config.aiEndpoint,
                this.#config.aiApiKey,
                this.#config.aiModel,
                this.#config.aiMaxTokens
            );
        }

        if (this.#config.enableHealthMetrics) {
            // Build AI config for aggregator if AI client is available
            let aggregatorAI: AggregatorAIConfig | null = null;
            if (this.#aiClient) {
                aggregatorAI = {
                    client: this.#aiClient,
                    aggregationPrompts: this.#config.defaultAggregationPrompts,
                    invocationPrompts: this.#config.defaultInvocationPrompts,
                    windowLogSampleSize: this.#config.aiWindowLogSampleSize,
                };
            }

            this.#healthAggregator = new HealthMetricsAggregator(
                this.#metricsEmitter,
                this.#config.aggregationIntervalMs,
                aggregatorAI
            );
            this.#healthAggregator.start();
        }

        systemLog('[MetricsPipeline] Initialized successfully');
    }

    get enabled(): boolean {
        return this.#enabled;
    }

    startInvocation(invocationId: string, functionName: string, traceId?: string): void {
        if (!this.#enabled) {
            return;
        }
        this.#collector.startTracking(invocationId, functionName, traceId);
    }

    bufferLog(invocationId: string, level: number | string, category: string, message: string): void {
        if (!this.#enabled) {
            return;
        }
        this.#collector.bufferLog(invocationId, level, category, message);

        // Also buffer error/warning logs for the AI window summary
        const levelName = typeof level === 'number' ? levelToName(level) : level;
        if (this.#healthAggregator && (levelName === 'error' || levelName === 'critical' || levelName === 'warning')) {
            this.#healthAggregator.bufferWindowLog({
                timestamp: new Date().toISOString(),
                level: levelName,
                category: category || 'user',
                message,
            });
        }
    }

    completeInvocation(invocationId: string, succeeded: boolean, error?: Error): void {
        if (!this.#enabled) {
            return;
        }

        if (error) {
            this.#collector.recordError(invocationId, error);
        }

        const result = this.#collector.completeTracking(invocationId, succeeded);
        if (!result) {
            return;
        }

        const { rawPayload, metric } = result;

        const alertType = this.#alertDetector.recordOutcome(metric.functionName, succeeded, metric.errorFingerprint);
        if (alertType) {
            metric.alertType = alertType;
        }

        // Check for per-invocation AI prompts (explicit or per-function config)
        const invocationPrompts =
            this.#healthAggregator?.consumeInvocationPrompt(invocationId) ||
            this.#config.functionPrompts.get(metric.functionName);
        if (invocationPrompts && invocationPrompts.length > 0 && this.#aiClient) {
            void this.#generateInvocationSummary(invocationPrompts, rawPayload, metric);
        }

        void this.#writeToBlobAndEmit(rawPayload, metric);

        if (this.#healthAggregator) {
            this.#healthAggregator.record(metric);
        }
    }

    /**
     * Set customer prompts for a specific invocation.
     * The prompts will be applied to that invocation's logs when it completes.
     */
    setInvocationPrompt(invocationId: string, prompts: string[]): void {
        if (this.#healthAggregator) {
            this.#healthAggregator.setInvocationPrompt(invocationId, prompts);
        }
    }

    /**
     * Set customer prompts for the current 1-minute aggregation window.
     * This overrides the default window prompts for the next flush.
     */
    setWindowPrompt(prompts: string[]): void {
        if (this.#healthAggregator) {
            this.#healthAggregator.setWindowPrompt(prompts);
        }
    }

    async #generateInvocationSummary(
        prompts: string[],
        rawPayload: RawLogPayload,
        metric: InvocationMetric
    ): Promise<void> {
        if (!this.#aiClient) {
            return;
        }
        try {
            const aiResult = await this.#aiClient.summarizeInvocation(
                prompts,
                metric.functionName,
                metric.invocationId,
                rawPayload.logs,
                metric.outcome === 0,
                metric.durationMs,
                rawPayload.error
            );
            if (aiResult) {
                metric.aiSummary = {
                    summary: aiResult.summary,
                    prompts: aiResult.prompts,
                    generatedAt: aiResult.generatedAt,
                };
                systemLog(
                    `[MetricsPipeline] AI invocation summary for ${metric.invocationId} (${aiResult.summary.length} chars)`
                );
                // Emit AI summary as a custom event to Application Insights
                this.#metricsEmitter.emitAISummary(metric.aiSummary, {
                    type: 'invocation',
                    functionName: metric.functionName,
                    invocationId: metric.invocationId,
                    traceId: metric.traceId,
                });
            }
        } catch (err) {
            systemError(`[MetricsPipeline] AI invocation summary failed for ${metric.invocationId}:`, err);
        }
    }

    async #writeToBlobAndEmit(rawPayload: RawLogPayload, metric: InvocationMetric): Promise<void> {
        try {
            const blobUri = await this.#blobWriter.writeLogPayload(rawPayload);
            if (blobUri) {
                metric.blobUri = blobUri;
            }
        } catch (err) {
            systemError(`[MetricsPipeline] Blob write failed for ${metric.invocationId}:`, err);
        }

        try {
            this.#metricsEmitter.emitInvocationMetric(metric);
        } catch (err) {
            systemError(`[MetricsPipeline] Metric emission failed for ${metric.invocationId}:`, err);
        }
    }

    async shutdown(): Promise<void> {
        if (!this.#enabled) {
            return;
        }

        systemLog('[MetricsPipeline] Shutting down...');

        if (this.#healthAggregator) {
            await this.#healthAggregator.stop();
        }

        await this.#metricsEmitter.flush();

        if (this.#metricsEmitter instanceof AppInsightsMetricsEmitter) {
            this.#metricsEmitter.dispose();
        }

        this.#collector.clear();

        systemLog('[MetricsPipeline] Shutdown complete');
    }

    get activeInvocations(): number {
        return this.#collector.activeCount;
    }

    get currentErrorRate(): number {
        return this.#alertDetector.getCurrentErrorRate();
    }

    get config(): PipelineConfig {
        return { ...this.#config };
    }
}

let _pipeline: MetricsPipeline | undefined;

export function getMetricsPipeline(): MetricsPipeline {
    if (!_pipeline) {
        _pipeline = new MetricsPipeline();
    }
    return _pipeline;
}

export async function resetMetricsPipeline(): Promise<void> {
    if (_pipeline) {
        await _pipeline.shutdown();
        _pipeline = undefined;
    }
}

export function isMetricsPipelineInitialized(): boolean {
    return _pipeline !== undefined;
}

const LOG_LEVEL_NAMES: Record<number, string> = {
    0: 'trace',
    1: 'debug',
    2: 'information',
    3: 'warning',
    4: 'error',
    5: 'critical',
    6: 'none',
};

function levelToName(level: number): string {
    return LOG_LEVEL_NAMES[level] || 'unknown';
}
