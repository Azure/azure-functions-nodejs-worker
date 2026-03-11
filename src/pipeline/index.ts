// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

export { AlertDetector } from './alertDetector';
export { AISummaryClient, AISummaryResult } from './aiSummaryClient';
export { BlobLogWriter, IBlobStorageClient, NoOpBlobLogWriter, RestBlobStorageClient } from './blobLogWriter';
export { generateErrorFingerprint, isSameError } from './errorFingerprint';
export { HealthMetricsAggregator } from './healthMetricsAggregator';
export { InvocationMetricsCollector } from './invocationMetricsCollector';
export { AppInsightsMetricsEmitter, IMetricsEmitter, NoOpMetricsEmitter } from './metricsEmitter';
export type { AISummaryEventContext } from './metricsEmitter';
export {
    getMetricsPipeline,
    isMetricsPipelineInitialized,
    MetricsPipeline,
    resetMetricsPipeline,
} from './metricsPipeline';
export { loadPipelineConfig, validatePipelineConfig } from './pipelineConfig';
export type {
    AggregatedHealthMetric,
    AISummary,
    AlertType,
    BufferedLogEntry,
    InvocationMetric,
    InvocationTracker,
    PipelineConfig,
    RawLogPayload,
} from './types';
