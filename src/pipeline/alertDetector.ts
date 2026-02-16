// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AlertType } from './types';

/**
 * Alert Detection Module.
 *
 * Provides real-time detection of error patterns:
 * - **Spike**: Error rate exceeds threshold in a sliding window
 * - **Cascade**: N consecutive failures (downstream dependency failure)
 * - **New Pattern**: A previously unseen error fingerprint appears
 */

interface WindowEntry {
    timestamp: number;
    succeeded: boolean;
}

export class AlertDetector {
    #window: WindowEntry[] = [];
    #windowSize: number;
    #spikeThreshold: number;
    #cascadeThreshold: number;
    #knownFingerprints = new Set<string>();
    #consecutiveFailures = 0;
    #functionConsecutiveFailures = new Map<string, number>();

    constructor(windowSize = 50, spikeThreshold = 0.5, cascadeThreshold = 5) {
        this.#windowSize = windowSize;
        this.#spikeThreshold = spikeThreshold;
        this.#cascadeThreshold = cascadeThreshold;
    }

    recordOutcome(functionName: string, succeeded: boolean, errorFingerprint?: string): AlertType | undefined {
        const now = Date.now();

        this.#window.push({ timestamp: now, succeeded });
        if (this.#window.length > this.#windowSize) {
            this.#window.shift();
        }

        if (succeeded) {
            this.#consecutiveFailures = 0;
            this.#functionConsecutiveFailures.set(functionName, 0);
        } else {
            this.#consecutiveFailures++;
            const fnCount = (this.#functionConsecutiveFailures.get(functionName) || 0) + 1;
            this.#functionConsecutiveFailures.set(functionName, fnCount);
        }

        // Detection priority: cascade > spike > new_pattern

        // 1. Cascade Detection
        const fnConsecutive = this.#functionConsecutiveFailures.get(functionName) || 0;
        if (fnConsecutive >= this.#cascadeThreshold || this.#consecutiveFailures >= this.#cascadeThreshold) {
            return 'cascade';
        }

        // 2. Spike Detection
        if (this.#window.length >= Math.min(10, this.#windowSize)) {
            const errorRate = this.#calculateErrorRate();
            if (errorRate >= this.#spikeThreshold) {
                return 'spike';
            }
        }

        // 3. New Pattern Detection
        if (!succeeded && errorFingerprint) {
            if (!this.#knownFingerprints.has(errorFingerprint)) {
                this.#knownFingerprints.add(errorFingerprint);
                return 'new_pattern';
            }
        }

        return undefined;
    }

    #calculateErrorRate(): number {
        if (this.#window.length === 0) {
            return 0;
        }
        const failures = this.#window.filter((e) => !e.succeeded).length;
        return failures / this.#window.length;
    }

    getCurrentErrorRate(): number {
        return this.#calculateErrorRate();
    }

    getConsecutiveFailures(): number {
        return this.#consecutiveFailures;
    }

    getKnownFingerprintCount(): number {
        return this.#knownFingerprints.size;
    }

    reset(): void {
        this.#window = [];
        this.#consecutiveFailures = 0;
        this.#functionConsecutiveFailures.clear();
        this.#knownFingerprints.clear();
    }
}
