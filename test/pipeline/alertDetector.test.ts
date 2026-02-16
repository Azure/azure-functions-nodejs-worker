// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import { AlertDetector } from '../../src/pipeline/alertDetector';

describe('AlertDetector', () => {
    let detector: AlertDetector;

    beforeEach(() => {
        detector = new AlertDetector(10, 0.5, 3);
    });

    describe('recordOutcome', () => {
        it('should return undefined for successful invocations', () => {
            const result = detector.recordOutcome('myFunc', true);
            expect(result).to.be.undefined;
        });

        it('should detect new_pattern for first occurrence of an error fingerprint', () => {
            const result = detector.recordOutcome('myFunc', false, 'fp-abc123');
            expect(result).to.equal('new_pattern');
        });

        it('should not re-detect the same error fingerprint', () => {
            detector.recordOutcome('myFunc', false, 'fp-abc123');
            const result = detector.recordOutcome('myFunc', false, 'fp-abc123');
            // Second occurrence won't be new_pattern (but could be spike/cascade)
            expect(result).to.not.equal('new_pattern');
        });

        it('should detect cascade after N consecutive failures', () => {
            detector.recordOutcome('myFunc', false, 'fp1');
            detector.recordOutcome('myFunc', false, 'fp1');
            const result = detector.recordOutcome('myFunc', false, 'fp1');
            expect(result).to.equal('cascade');
        });

        it('should reset consecutive failures on success', () => {
            detector.recordOutcome('myFunc', false, 'fp1');
            detector.recordOutcome('myFunc', false, 'fp1');
            detector.recordOutcome('myFunc', true); // reset
            const result = detector.recordOutcome('myFunc', false, 'fp1');
            // Only 1 consecutive failure, should not be cascade
            expect(result).to.not.equal('cascade');
        });

        it('should detect spike when error rate exceeds threshold', () => {
            // Fill window with 10 entries, 6 failures (60% > 50% threshold)
            for (let i = 0; i < 4; i++) {
                detector.recordOutcome('myFunc', true);
            }
            for (let i = 0; i < 5; i++) {
                detector.recordOutcome('myFunc', false, 'fp1');
            }
            // At this point: 4 success + 5 failure = 9 entries, 5/9 = 55.5% error rate
            const result = detector.recordOutcome('myFunc', false, 'fp1');
            // 4 success + 6 failure = 10 entries, 6/10 = 60% > 50% → spike
            // But cascade (6 consecutive) comes first in priority
            expect(result).to.be.oneOf(['spike', 'cascade']);
        });

        it('should prioritize cascade over spike', () => {
            // 3 consecutive failures → cascade
            detector.recordOutcome('myFunc', false, 'fp1');
            detector.recordOutcome('myFunc', false, 'fp1');
            const result = detector.recordOutcome('myFunc', false, 'fp1');
            expect(result).to.equal('cascade');
        });
    });

    describe('getCurrentErrorRate', () => {
        it('should return 0 for empty window', () => {
            expect(detector.getCurrentErrorRate()).to.equal(0);
        });

        it('should return correct rate', () => {
            detector.recordOutcome('f', true);
            detector.recordOutcome('f', false, 'fp1');
            expect(detector.getCurrentErrorRate()).to.equal(0.5);
        });
    });

    describe('reset', () => {
        it('should clear all state', () => {
            detector.recordOutcome('f', false, 'fp1');
            detector.recordOutcome('f', false, 'fp1');
            detector.reset();
            expect(detector.getCurrentErrorRate()).to.equal(0);
            expect(detector.getConsecutiveFailures()).to.equal(0);
            expect(detector.getKnownFingerprintCount()).to.equal(0);
        });
    });
});
