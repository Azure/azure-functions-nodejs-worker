// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import { HealthMetricsAggregator } from '../../src/pipeline/healthMetricsAggregator';
import { IMetricsEmitter } from '../../src/pipeline/metricsEmitter';
import { AggregatedHealthMetric, InvocationMetric } from '../../src/pipeline/types';

describe('HealthMetricsAggregator', () => {
    let emittedHealthMetrics: AggregatedHealthMetric[];
    let emitter: IMetricsEmitter;
    let aggregator: HealthMetricsAggregator;

    beforeEach(() => {
        emittedHealthMetrics = [];
        emitter = {
            emitInvocationMetric(_metric: InvocationMetric): void {
                // no-op
            },
            emitHealthMetric(metric: AggregatedHealthMetric): void {
                emittedHealthMetrics.push(metric);
            },
            emitAISummary(): void {
                // no-op
            },
            async flush(): Promise<void> {
                // no-op
            },
        };
        aggregator = new HealthMetricsAggregator(emitter, 60000);
    });

    afterEach(() => {
        aggregator.stop();
    });

    function makeMetric(functionName: string, outcome: 0 | 1, durationMs: number): InvocationMetric {
        return {
            functionName,
            invocationId: `inv-${Math.random()}`,
            traceId: `trace-${Math.random()}`,
            outcome,
            durationMs,
            logCount: 5,
            errorCount: outcome === 1 ? 1 : 0,
            timestamp: new Date().toISOString(),
            workerVersion: '3.13.0',
        };
    }

    it('should accumulate metrics and flush aggregates', () => {
        aggregator.record(makeMetric('FuncA', 0, 100));
        aggregator.record(makeMetric('FuncA', 0, 200));
        aggregator.record(makeMetric('FuncA', 1, 300));
        aggregator.record(makeMetric('FuncB', 0, 50));

        aggregator.flushAggregates();

        expect(emittedHealthMetrics).to.have.lengthOf(2);

        const funcA = emittedHealthMetrics.find((m) => m.functionName === 'FuncA')!;
        expect(funcA.invocationCount).to.equal(3);
        expect(funcA.successCount).to.equal(2);
        expect(funcA.failureCount).to.equal(1);
        expect(funcA.successRate).to.be.closeTo(2 / 3, 0.001);
        expect(funcA.errorRate).to.be.closeTo(1 / 3, 0.001);
        expect(funcA.totalLogCount).to.equal(15);
        expect(funcA.totalErrorCount).to.equal(1);
        expect(funcA.durationP50).to.equal(200);

        const funcB = emittedHealthMetrics.find((m) => m.functionName === 'FuncB')!;
        expect(funcB.invocationCount).to.equal(1);
        expect(funcB.successCount).to.equal(1);
    });

    it('should clear accumulators after flush', () => {
        aggregator.record(makeMetric('FuncA', 0, 100));
        aggregator.flushAggregates();

        emittedHealthMetrics = [];
        aggregator.flushAggregates();

        expect(emittedHealthMetrics).to.have.lengthOf(0);
    });

    it('should not emit if no data accumulated', () => {
        aggregator.flushAggregates();
        expect(emittedHealthMetrics).to.have.lengthOf(0);
    });

    it('should calculate percentiles correctly', () => {
        // Add 10 invocations with durations 10, 20, 30, ..., 100
        for (let i = 1; i <= 10; i++) {
            aggregator.record(makeMetric('FuncA', 0, i * 10));
        }

        aggregator.flushAggregates();

        const metric = emittedHealthMetrics[0];
        expect(metric.durationP50).to.be.closeTo(55, 1);
        expect(metric.durationP95).to.be.closeTo(95.5, 1);
        expect(metric.durationP99).to.be.closeTo(99.1, 1);
    });
});
