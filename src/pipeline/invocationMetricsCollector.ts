// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { performance } from 'perf_hooks';
import { version } from '../constants';
import { generateErrorFingerprint } from './errorFingerprint';
import { BufferedLogEntry, InvocationMetric, InvocationTracker, RawLogPayload } from './types';

/**
 * Invocation Metrics Collector.
 *
 * Manages per-invocation tracking: buffering logs, capturing timing,
 * and producing both the raw log payload (for Blob Storage) and the
 * lightweight metric (for Application Insights) when an invocation completes.
 */

const LOG_LEVEL_NAMES: Record<number, string> = {
    0: 'trace',
    1: 'debug',
    2: 'information',
    3: 'warning',
    4: 'error',
    5: 'critical',
    6: 'none',
};

const ERROR_LEVELS = new Set(['error', 'critical']);

export class InvocationMetricsCollector {
    #trackers = new Map<string, InvocationTracker>();
    #maxLogsPerInvocation: number;

    constructor(maxLogsPerInvocation = 10000) {
        this.#maxLogsPerInvocation = maxLogsPerInvocation;
    }

    startTracking(invocationId: string, functionName: string, traceId?: string): void {
        this.#trackers.set(invocationId, {
            functionName,
            invocationId,
            traceId: traceId || invocationId,
            startTimeHr: performance.now(),
            startTime: new Date(),
            logs: [],
            errorCount: 0,
        });
    }

    bufferLog(invocationId: string, level: number | string, category: string, message: string): void {
        const tracker = this.#trackers.get(invocationId);
        if (!tracker) {
            return;
        }

        if (tracker.logs.length >= this.#maxLogsPerInvocation) {
            return;
        }

        const levelName = typeof level === 'number' ? LOG_LEVEL_NAMES[level] || 'unknown' : level;

        const entry: BufferedLogEntry = {
            timestamp: new Date().toISOString(),
            level: levelName,
            category: category || 'user',
            message,
        };

        tracker.logs.push(entry);

        if (ERROR_LEVELS.has(levelName)) {
            tracker.errorCount++;
            if (!tracker.firstError) {
                tracker.firstError = { message };
            }
        }
    }

    recordError(invocationId: string, error: Error): void {
        const tracker = this.#trackers.get(invocationId);
        if (!tracker) {
            return;
        }

        tracker.errorCount++;
        if (!tracker.firstError) {
            tracker.firstError = {
                message: error.message,
                stack: error.stack,
            };
        }
    }

    completeTracking(
        invocationId: string,
        succeeded: boolean
    ): { rawPayload: RawLogPayload; metric: InvocationMetric } | undefined {
        const tracker = this.#trackers.get(invocationId);
        if (!tracker) {
            return undefined;
        }

        this.#trackers.delete(invocationId);

        const endTime = new Date();
        const durationMs = Math.round(performance.now() - tracker.startTimeHr);

        let errorFingerprint: string | undefined;
        if (tracker.firstError) {
            errorFingerprint = generateErrorFingerprint(tracker.firstError.message, tracker.firstError.stack);
        }

        const rawPayload: RawLogPayload = {
            functionName: tracker.functionName,
            invocationId: tracker.invocationId,
            traceId: tracker.traceId,
            outcome: succeeded ? 'success' : 'failure',
            durationMs,
            startTime: tracker.startTime.toISOString(),
            endTime: endTime.toISOString(),
            logs: tracker.logs,
        };

        if (tracker.firstError) {
            rawPayload.error = {
                message: tracker.firstError.message,
                stack: tracker.firstError.stack,
                fingerprint: errorFingerprint || '',
            };
        }

        const metric: InvocationMetric = {
            functionName: tracker.functionName,
            invocationId: tracker.invocationId,
            traceId: tracker.traceId,
            outcome: succeeded ? 0 : 1,
            durationMs,
            logCount: tracker.logs.length,
            errorCount: tracker.errorCount,
            timestamp: endTime.toISOString(),
            workerVersion: version,
        };

        if (errorFingerprint) {
            metric.errorFingerprint = errorFingerprint;
        }

        return { rawPayload, metric };
    }

    isTracking(invocationId: string): boolean {
        return this.#trackers.has(invocationId);
    }

    get activeCount(): number {
        return this.#trackers.size;
    }

    abandonTracking(invocationId: string): void {
        this.#trackers.delete(invocationId);
    }

    clear(): void {
        this.#trackers.clear();
    }
}
