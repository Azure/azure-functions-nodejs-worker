// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import { InvocationMetricsCollector } from '../../src/pipeline/invocationMetricsCollector';

describe('InvocationMetricsCollector', () => {
    let collector: InvocationMetricsCollector;

    beforeEach(() => {
        collector = new InvocationMetricsCollector(100);
    });

    describe('startTracking', () => {
        it('should begin tracking an invocation', () => {
            collector.startTracking('inv-1', 'MyFunction', 'trace-1');
            expect(collector.isTracking('inv-1')).to.be.true;
            expect(collector.activeCount).to.equal(1);
        });
    });

    describe('bufferLog', () => {
        it('should buffer logs for tracked invocations', () => {
            collector.startTracking('inv-1', 'MyFunction');
            collector.bufferLog('inv-1', 2, 'user', 'Hello world');
            collector.bufferLog('inv-1', 2, 'user', 'Processing...');

            const result = collector.completeTracking('inv-1', true);
            expect(result).to.not.be.undefined;
            expect(result!.rawPayload.logs).to.have.lengthOf(2);
            expect(result!.rawPayload.logs[0].message).to.equal('Hello world');
            expect(result!.rawPayload.logs[1].message).to.equal('Processing...');
        });

        it('should not buffer for untracked invocations', () => {
            collector.bufferLog('unknown', 2, 'user', 'should be ignored');
            expect(collector.isTracking('unknown')).to.be.false;
        });

        it('should respect maxLogsPerInvocation', () => {
            const smallCollector = new InvocationMetricsCollector(3);
            smallCollector.startTracking('inv-1', 'MyFunction');
            for (let i = 0; i < 10; i++) {
                smallCollector.bufferLog('inv-1', 2, 'user', `msg-${i}`);
            }

            const result = smallCollector.completeTracking('inv-1', true);
            expect(result!.rawPayload.logs).to.have.lengthOf(3);
        });

        it('should count error-level logs', () => {
            collector.startTracking('inv-1', 'MyFunction');
            collector.bufferLog('inv-1', 2, 'user', 'info msg');
            collector.bufferLog('inv-1', 4, 'user', 'error msg');
            collector.bufferLog('inv-1', 5, 'user', 'critical msg');

            const result = collector.completeTracking('inv-1', false);
            expect(result!.metric.errorCount).to.equal(2);
        });
    });

    describe('completeTracking', () => {
        it('should return rawPayload and metric on success', () => {
            collector.startTracking('inv-1', 'MyFunction', 'trace-abc');
            collector.bufferLog('inv-1', 2, 'user', 'hello');

            const result = collector.completeTracking('inv-1', true);
            expect(result).to.not.be.undefined;

            // Raw payload
            expect(result!.rawPayload.functionName).to.equal('MyFunction');
            expect(result!.rawPayload.invocationId).to.equal('inv-1');
            expect(result!.rawPayload.traceId).to.equal('trace-abc');
            expect(result!.rawPayload.outcome).to.equal('success');
            expect(result!.rawPayload.durationMs).to.be.a('number');
            expect(result!.rawPayload.logs).to.have.lengthOf(1);

            // Metric
            expect(result!.metric.functionName).to.equal('MyFunction');
            expect(result!.metric.invocationId).to.equal('inv-1');
            expect(result!.metric.outcome).to.equal(0);
            expect(result!.metric.logCount).to.equal(1);
            expect(result!.metric.errorCount).to.equal(0);
            expect(result!.metric.errorFingerprint).to.be.undefined;
        });

        it('should set error fingerprint on failure with error', () => {
            collector.startTracking('inv-1', 'MyFunction');
            collector.recordError('inv-1', new Error('Something broke'));

            const result = collector.completeTracking('inv-1', false);
            expect(result!.metric.outcome).to.equal(1);
            expect(result!.metric.errorFingerprint).to.be.a('string');
            expect(result!.metric.errorFingerprint).to.have.lengthOf(16);
            expect(result!.rawPayload.error).to.not.be.undefined;
            expect(result!.rawPayload.error!.message).to.equal('Something broke');
        });

        it('should return undefined if invocation was not tracked', () => {
            const result = collector.completeTracking('unknown', true);
            expect(result).to.be.undefined;
        });

        it('should remove tracking after completion', () => {
            collector.startTracking('inv-1', 'MyFunction');
            collector.completeTracking('inv-1', true);
            expect(collector.isTracking('inv-1')).to.be.false;
            expect(collector.activeCount).to.equal(0);
        });
    });

    describe('abandonTracking', () => {
        it('should remove a specific tracker', () => {
            collector.startTracking('inv-1', 'MyFunction');
            collector.startTracking('inv-2', 'OtherFunc');
            collector.abandonTracking('inv-1');
            expect(collector.isTracking('inv-1')).to.be.false;
            expect(collector.isTracking('inv-2')).to.be.true;
        });
    });

    describe('clear', () => {
        it('should remove all trackers', () => {
            collector.startTracking('inv-1', 'MyFunction');
            collector.startTracking('inv-2', 'OtherFunc');
            collector.clear();
            expect(collector.activeCount).to.equal(0);
        });
    });
});
