// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

/**
 * Types for the Storage-First + Metrics Pipeline.
 *
 * Separates the data plane (raw logs → Blob Storage) from the metrics plane
 * (lightweight numeric metrics → Application Insights) to achieve 95–99% reduction
 * in App Insights ingestion cost.
 */

/**
 * Lightweight metric payload emitted per invocation (~100–200 bytes).
 * This is the only data sent to Application Insights.
 */
export interface InvocationMetric {
    /** Name of the Azure Function */
    functionName: string;
    /** Unique invocation identifier */
    invocationId: string;
    /** Distributed trace identifier */
    traceId: string;
    /** Outcome: 0 = success, 1 = failure */
    outcome: 0 | 1;
    /** Total invocation duration in milliseconds */
    durationMs: number;
    /** Number of log lines produced during invocation */
    logCount: number;
    /** Number of error-level logs */
    errorCount: number;
    /** SHA-256-based fingerprint of the first error (if any) */
    errorFingerprint?: string;
    /** Alert type detected by spike/cascade/pattern detection */
    alertType?: AlertType;
    /** URI to the raw logs in Blob Storage for drill-down */
    blobUri?: string;
    /** AI-generated summary for this invocation (if customer prompt provided) */
    aiSummary?: AISummary;
    /** ISO 8601 timestamp */
    timestamp: string;
    /** Worker version */
    workerVersion: string;
}

/**
 * A single buffered log entry captured during an invocation.
 */
export interface BufferedLogEntry {
    /** ISO 8601 timestamp */
    timestamp: string;
    /** Log level: trace, debug, information, warning, error, critical */
    level: string;
    /** Log category: system or user */
    category: string;
    /** The log message text */
    message: string;
}

/**
 * The full raw log payload written to Blob Storage per invocation.
 */
export interface RawLogPayload {
    /** Function name */
    functionName: string;
    /** Invocation ID */
    invocationId: string;
    /** Trace ID for distributed tracing */
    traceId: string;
    /** Outcome: 'success' | 'failure' */
    outcome: 'success' | 'failure';
    /** Duration of the invocation in ms */
    durationMs: number;
    /** ISO 8601 start time */
    startTime: string;
    /** ISO 8601 end time */
    endTime: string;
    /** All buffered log entries */
    logs: BufferedLogEntry[];
    /** Error details if the invocation failed */
    error?: {
        message: string;
        stack?: string;
        fingerprint: string;
    };
}

/**
 * Alert types detected by the pattern detection module.
 */
export type AlertType = 'spike' | 'cascade' | 'new_pattern';

/**
 * Aggregated health metrics for a function over a time window.
 */
export interface AggregatedHealthMetric {
    /** Function name */
    functionName: string;
    /** Number of invocations in the window */
    invocationCount: number;
    /** Number of successful invocations */
    successCount: number;
    /** Number of failed invocations */
    failureCount: number;
    /** Success rate (0–1) */
    successRate: number;
    /** Error rate (0–1) */
    errorRate: number;
    /** Duration percentiles in ms */
    durationP50: number;
    durationP95: number;
    durationP99: number;
    /** Total logs produced */
    totalLogCount: number;
    /** Total errors */
    totalErrorCount: number;
    /** Window start (ISO 8601) */
    windowStart: string;
    /** Window end (ISO 8601) */
    windowEnd: string;
    /** AI-generated summary for this aggregation window (if prompt configured) */
    aiSummary?: AISummary;
}

/**
 * Configuration for the metrics pipeline.
 */
export interface PipelineConfig {
    /** Whether the pipeline is enabled */
    enabled: boolean;

    /** Azure Blob Storage connection string */
    blobConnectionString?: string;
    /** Blob container name for raw logs (default: 'function-logs') */
    blobContainerName: string;

    /** Application Insights connection string */
    appInsightsConnectionString?: string;

    /** Whether to gzip-compress log payloads before upload (default: true) */
    compressLogs: boolean;

    /** Spike detection: error rate threshold (fraction, 0–1) to trigger a spike alert */
    spikeErrorRateThreshold: number;
    /** Spike detection: sliding window size in number of invocations */
    spikeWindowSize: number;

    /** Cascade detection: number of consecutive failures to trigger cascade alert */
    cascadeThreshold: number;

    /** Aggregation flush interval in milliseconds (default: 60000 = 1 minute) */
    aggregationIntervalMs: number;

    /** Maximum number of log entries to buffer per invocation before truncating */
    maxLogsPerInvocation: number;

    /** Maximum blob upload retries */
    blobUploadMaxRetries: number;

    /** Whether to enable periodic aggregated health metrics */
    enableHealthMetrics: boolean;

    /** Azure OpenAI Foundry endpoint for AI-powered summaries */
    aiEndpoint?: string;
    /** API key for the Azure OpenAI Foundry endpoint */
    aiApiKey?: string;
    /** Model deployment name (default: 'gpt-4o') */
    aiModel: string;
    /** Max output tokens for AI summaries (default: 1024) */
    aiMaxTokens: number;
    /** Whether to enable AI-powered summaries */
    enableAISummaries: boolean;
    /** Default prompts for per-invocation summaries (customer-overridable list) */
    defaultInvocationPrompts: string[];
    /** Default prompts for per-aggregation-window summaries (customer-overridable list) */
    defaultAggregationPrompts: string[];
    /** Max error/warning logs to sample per window for AI summary */
    aiWindowLogSampleSize: number;
    /**
     * Per-function AI prompt lists. Keys are function names, values are prompt arrays.
     * When a function has configured prompts, every invocation of that function
     * will automatically get an AI summary using those prompts.
     *
     * Configurable via:
     * - JSON: `AZURE_FUNCTIONS_METRICS_PIPELINE_FUNCTION_PROMPTS` = '{"MyFunc": ["Analyze...", "Check..."]}'
     * - Individual: `AZURE_FUNCTIONS_METRICS_PIPELINE_PER_INVOCATION_PROMPTS_MyFunc` = '["Analyze...", "Check..."]'
     * - Individual (single): `AZURE_FUNCTIONS_METRICS_PIPELINE_PER_INVOCATION_PROMPTS_MyFunc` = 'Analyze...'
     * - local.settings.json Values section (same keys)
     */
    functionPrompts: Map<string, string[]>;
}

/**
 * Per-invocation context tracked by the metrics collector.
 */
export interface InvocationTracker {
    /** Function name */
    functionName: string;
    /** Invocation ID */
    invocationId: string;
    /** Trace ID */
    traceId: string;
    /** Start timestamp (high-resolution) via performance.now() */
    startTimeHr: number;
    /** Start time as Date */
    startTime: Date;
    /** Buffered log entries */
    logs: BufferedLogEntry[];
    /** Count of error-level logs */
    errorCount: number;
    /** First error encountered */
    firstError?: { message: string; stack?: string };
}

/**
 * AI summary result attached to invocation metrics or aggregation windows.
 */
export interface AISummary {
    /** The generated summary text */
    summary: string;
    /** The prompts that produced this summary */
    prompts: string[];
    /** ISO 8601 timestamp of when the summary was generated */
    generatedAt: string;
}
