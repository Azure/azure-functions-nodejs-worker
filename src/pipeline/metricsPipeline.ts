// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { systemError, systemLog, systemWarn } from '../utils/Logger';
import { AlertDetector } from './alertDetector';
import { BlobLogWriter, NoOpBlobLogWriter, RestBlobStorageClient } from './blobLogWriter';
import { HealthMetricsAggregator } from './healthMetricsAggregator';
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

        if (this.#config.enableHealthMetrics) {
            this.#healthAggregator = new HealthMetricsAggregator(
                this.#metricsEmitter,
                this.#config.aggregationIntervalMs
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

        void this.#writeToBlobAndEmit(rawPayload, metric);

        if (this.#healthAggregator) {
            this.#healthAggregator.record(metric);
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
            this.#healthAggregator.stop();
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
