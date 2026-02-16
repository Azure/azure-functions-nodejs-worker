// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { systemLog } from '../utils/Logger';
import { IMetricsEmitter } from './metricsEmitter';
import { AggregatedHealthMetric, InvocationMetric } from './types';

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

    constructor(emitter: IMetricsEmitter, intervalMs = 60000) {
        this.#emitter = emitter;
        this.#intervalMs = intervalMs;
        this.#windowStart = new Date();
    }

    /**
     * Start periodic aggregation. The timer will not keep the process alive.
     */
    start(): void {
        if (this.#timer) {
            return;
        }

        this.#timer = setInterval(() => {
            this.flushAggregates();
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
     * Flush all accumulators and emit aggregated health metrics.
     */
    flushAggregates(): void {
        if (this.#accumulators.size === 0) {
            return;
        }

        const windowEnd = new Date();
        const windowStartStr = this.#windowStart.toISOString();
        const windowEndStr = windowEnd.toISOString();

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

            this.#emitter.emitHealthMetric(healthMetric);
        }

        // Reset for next window
        this.#accumulators.clear();
        this.#windowStart = windowEnd;
    }

    /**
     * Stop the aggregation timer and flush remaining data.
     */
    stop(): void {
        if (this.#timer) {
            clearInterval(this.#timer);
            this.#timer = null;
        }
        this.flushAggregates();
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
