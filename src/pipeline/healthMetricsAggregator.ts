// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { systemError, systemLog } from '../utils/Logger';
import { AISummaryClient } from './aiSummaryClient';
import { IMetricsEmitter } from './metricsEmitter';
import { AggregatedHealthMetric, BufferedLogEntry, InvocationMetric } from './types';

/**
 * Aggregated Health Metrics.
 *
 * Accumulates per-function invocation metrics over a configurable time window
 * and periodically emits aggregated health metrics to Application Insights.
 *
 * Emitted metrics include:
 * - Invocation count, success/failure counts, success/error rates
 * - Duration percentiles (p50, p95, p99)
 * - Total log and error counts
 */

/**
 * Per-function accumulator for a single aggregation window.
 */
interface FunctionAccumulator {
    invocationCount: number;
    successCount: number;
    failureCount: number;
    durations: number[];
    totalLogCount: number;
    totalErrorCount: number;
}

/**
 * Configuration for AI-powered summaries in the aggregator.
 */
export interface AggregatorAIConfig {
    /** AI summary client instance */
    client: AISummaryClient;
    /** Default prompts for per-aggregation-window summaries */
    aggregationPrompts: string[];
    /** Default prompts for per-invocation summaries */
    invocationPrompts: string[];
    /** Max error/warning logs to sample in window summary */
    windowLogSampleSize: number;
}

export class HealthMetricsAggregator {
    /** Per-function accumulators */
    #accumulators = new Map<string, FunctionAccumulator>();
    /** Start of the current aggregation window */
    #windowStart: Date;
    /** Timer for periodic emission */
    #timer: ReturnType<typeof setInterval> | null = null;
    /** Metrics emitter */
    #emitter: IMetricsEmitter;
    /** Aggregation interval in ms */
    #intervalMs: number;
    /** AI configuration (optional) */
    #aiConfig: AggregatorAIConfig | null;
    /** Error/warning logs collected in the current window for AI summary */
    #windowLogs: BufferedLogEntry[] = [];
    /** Max log entries to keep per window for AI summary */
    #windowLogSampleSize: number;
    /** Per-invocation customer prompt lists awaiting processing: invocationId -> prompts */
    #pendingInvocationPrompts = new Map<string, string[]>();
    /** Active per-window prompt list override (customer can set per minute) */
    #activeWindowPrompts: string[] | null = null;

    constructor(emitter: IMetricsEmitter, intervalMs = 60000, aiConfig: AggregatorAIConfig | null = null) {
        this.#emitter = emitter;
        this.#intervalMs = intervalMs;
        this.#windowStart = new Date();
        this.#aiConfig = aiConfig;
        this.#windowLogSampleSize = aiConfig?.windowLogSampleSize ?? 50;
    }

    /**
     * Start periodic aggregation. The timer will not keep the process alive.
     */
    start(): void {
        if (this.#timer) {
            return;
        }

        this.#timer = setInterval(() => {
            void this.flushAggregates();
        }, this.#intervalMs);

        // Don't block process exit
        if (this.#timer.unref) {
            this.#timer.unref();
        }

        systemLog('Health metrics aggregator started');
    }

    /**
     * Record an invocation metric into the current aggregation window.
     */
    record(metric: InvocationMetric): void {
        let acc = this.#accumulators.get(metric.functionName);
        if (!acc) {
            acc = {
                invocationCount: 0,
                successCount: 0,
                failureCount: 0,
                durations: [],
                totalLogCount: 0,
                totalErrorCount: 0,
            };
            this.#accumulators.set(metric.functionName, acc);
        }

        acc.invocationCount++;
        if (metric.outcome === 0) {
            acc.successCount++;
        } else {
            acc.failureCount++;
        }
        acc.durations.push(metric.durationMs);
        acc.totalLogCount += metric.logCount;
        acc.totalErrorCount += metric.errorCount;
    }

    /**
     * Buffer error/warning log entries for the current aggregation window.
     * These are sampled and included in the AI summary at flush time.
     */
    bufferWindowLog(entry: BufferedLogEntry): void {
        if (this.#windowLogs.length < this.#windowLogSampleSize) {
            this.#windowLogs.push(entry);
        }
    }

    /**
     * Set customer prompts for a specific invocation.
     * These prompts will be used to generate an AI summary for that invocation's logs.
     */
    setInvocationPrompt(invocationId: string, prompts: string[]): void {
        this.#pendingInvocationPrompts.set(invocationId, prompts);
    }

    /**
     * Get and consume the pending invocation prompts (if any).
     */
    consumeInvocationPrompt(invocationId: string): string[] | undefined {
        const prompts = this.#pendingInvocationPrompts.get(invocationId);
        if (prompts) {
            this.#pendingInvocationPrompts.delete(invocationId);
        }
        return prompts;
    }

    /**
     * Set customer prompts to apply to the next 1-minute window summary.
     * Overrides the default window prompts for the current/next flush cycle.
     */
    setWindowPrompt(prompts: string[]): void {
        this.#activeWindowPrompts = prompts;
    }

    /**
     * Flush all accumulators and emit aggregated health metrics.
     * If AI is configured, also generates a window summary.
     */
    async flushAggregates(): Promise<void> {
        if (this.#accumulators.size === 0) {
            return;
        }

        const windowEnd = new Date();
        const windowStartStr = this.#windowStart.toISOString();
        const windowEndStr = windowEnd.toISOString();

        const healthMetrics: AggregatedHealthMetric[] = [];

        for (const [functionName, acc] of this.#accumulators) {
            if (acc.invocationCount === 0) {
                continue;
            }

            // Sort durations for percentile calculation
            const sorted = acc.durations.slice().sort((a, b) => a - b);

            const healthMetric: AggregatedHealthMetric = {
                functionName,
                invocationCount: acc.invocationCount,
                successCount: acc.successCount,
                failureCount: acc.failureCount,
                successRate: acc.invocationCount > 0 ? acc.successCount / acc.invocationCount : 1,
                errorRate: acc.invocationCount > 0 ? acc.failureCount / acc.invocationCount : 0,
                durationP50: percentile(sorted, 50),
                durationP95: percentile(sorted, 95),
                durationP99: percentile(sorted, 99),
                totalLogCount: acc.totalLogCount,
                totalErrorCount: acc.totalErrorCount,
                windowStart: windowStartStr,
                windowEnd: windowEndStr,
            };

            healthMetrics.push(healthMetric);
        }

        // Generate AI window summary if configured
        if (this.#aiConfig && healthMetrics.length > 0) {
            const aggregationPrompts = this.#activeWindowPrompts || this.#aiConfig.aggregationPrompts;
            try {
                const aiResult = await this.#aiConfig.client.summarizeWindow(
                    aggregationPrompts,
                    healthMetrics,
                    this.#windowLogs
                );
                if (aiResult) {
                    // Attach the AI summary to each function's health metric
                    for (const hm of healthMetrics) {
                        hm.aiSummary = {
                            summary: aiResult.summary,
                            prompts: aiResult.prompts,
                            generatedAt: aiResult.generatedAt,
                        };
                    }
                    systemLog(
                        `[HealthMetricsAggregator] AI window summary generated (${aiResult.summary.length} chars)`
                    );
                    // Emit AI window summary as a custom event to Application Insights
                    for (const hm of healthMetrics) {
                        this.#emitter.emitAISummary(
                            { summary: aiResult.summary, prompts: aiResult.prompts, generatedAt: aiResult.generatedAt },
                            {
                                type: 'window',
                                functionName: hm.functionName,
                                windowStart: windowStartStr,
                                windowEnd: windowEndStr,
                            }
                        );
                    }
                }
            } catch (err) {
                systemError('[HealthMetricsAggregator] AI window summary failed:', err);
            }
        }

        // Emit all health metrics
        for (const hm of healthMetrics) {
            this.#emitter.emitHealthMetric(hm);
        }

        // Reset for next window
        this.#accumulators.clear();
        this.#windowLogs = [];
        this.#activeWindowPrompts = null;
        this.#windowStart = windowEnd;
    }

    /**
     * Stop the aggregation timer and flush remaining data.
     */
    async stop(): Promise<void> {
        if (this.#timer) {
            clearInterval(this.#timer);
            this.#timer = null;
        }
        await this.flushAggregates();
    }
}

/**
 * Calculate the p-th percentile from a sorted array.
 */
function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) {
        return 0;
    }
    if (sorted.length === 1) {
        return sorted[0];
    }

    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
        return sorted[lower];
    }

    const fraction = index - lower;
    return sorted[lower] + fraction * (sorted[upper] - sorted[lower]);
}
