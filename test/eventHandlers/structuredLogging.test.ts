// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import 'mocha';
import * as coreTypes from '@azure/functions-core';
import { expect } from 'chai';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { InvocationHandler } from '../../src/eventHandlers/InvocationHandler';
import { InvocationLogContext } from '../../src/hooks/LogHookContext';
import { worker } from '../../src/WorkerContext';
import { beforeEventHandlerSuite } from './beforeEventHandlerSuite';
import { TestEventStream } from './TestEventStream';

describe('structured log properties', () => {
    let stream: TestEventStream;
    let coreApi: typeof coreTypes;

    before(async () => {
        stream = beforeEventHandlerSuite();
        coreApi = await import('@azure/functions-core');
    });

    afterEach(async () => {
        stream.written.resetHistory();
        await stream.afterEachEventHandlerTest();
    });

    function logs(): rpc.IRpcLog[] {
        return stream.written.getCalls().map((call) => (call.args[0] as rpc.IStreamingMessage).rpcLog!);
    }

    function logWithMetadata(attributes: unknown, context?: InvocationLogContext): void {
        worker.log(
            {
                message: 'submission failed { stationId: Merida }',
                level: rpc.RpcLog.Level.Error,
                logCategory: rpc.RpcLog.RpcLogCategory.User,
                invocationId: 'invocation-one',
            },
            context,
            { attributes } as coreTypes.LogMetadata
        );
    }

    it('restricts structured logging options to log hooks in the public types', () => {
        const checkTypes = () => {
            // @ts-expect-error Log options do not apply to invocation hooks.
            coreApi.registerHook('preInvocation', () => {}, { structuredLogProperties: true });
        };
        void checkTypes;
    });

    it('exposes capability and preserves metadata only on the process-local hook path', () => {
        expect(coreApi.supportsStructuredLogProperties).to.equal(true);
        const captured: coreTypes.LogHookContext[] = [];
        coreApi.registerHook('log', (context) => captured.push(context), { structuredLogProperties: true });
        coreApi.log('error', 'user', 'submission failed', {
            attributes: { stationId: 'Merida', attempts: 2, retry: false },
        });
        expect(captured).to.have.length(1);
        expect(captured[0].attributes).to.deep.equal({ stationId: 'Merida', attempts: 2, retry: false });
        expect(Object.isFrozen(captured[0].attributes)).to.equal(true);
        expect(logs()).to.deep.equal([
            {
                message: 'submission failed',
                level: rpc.RpcLog.Level.Error,
                logCategory: rpc.RpcLog.RpcLogCategory.User,
            },
        ]);
        const roundTrip = rpc.StreamingMessage.decode(rpc.StreamingMessage.encode({ rpcLog: logs()[0] }).finish());
        expect(roundTrip.rpcLog?.message).to.equal('submission failed');
        expect(Object.keys(roundTrip.rpcLog?.propertiesMap ?? {})).to.have.length(0);
    });

    it('retains one original log per call and bounds missing-consumer warnings by invocation', () => {
        const first = { hookData: {}, invocationContext: { invocationId: 'first' } };
        const second = { hookData: {}, invocationContext: { invocationId: 'second' } };
        const observed: string[] = [];
        coreApi.registerHook('log', (context) => observed.push(context.message));
        logWithMetadata({ stationId: 'Merida' }, first);
        logWithMetadata({ stationId: 'Merida' }, first);
        logWithMetadata({ stationId: 'Other' }, second);
        expect(logs().filter((log) => log.logCategory === rpc.RpcLog.RpcLogCategory.User)).to.have.length(3);
        expect(logs().filter((log) => log.message === 'structured_log_consumer_unavailable')).to.have.length(2);
        expect(observed).to.have.length(5);
    });

    it('removes consumer support on disposal, including duplicate registrations', () => {
        const callback = () => {};
        const first = coreApi.registerHook('log', callback, { structuredLogProperties: true });
        const second = coreApi.registerHook('log', callback, { structuredLogProperties: true });
        first.dispose();
        coreApi.log('information', 'user', 'first', { attributes: {} });
        expect(logs()).to.have.length(1);
        second.dispose();
        coreApi.log('information', 'user', 'second', { attributes: {} });
        coreApi.log('information', 'user', 'third', { attributes: {} });
        expect(logs().filter((log) => log.message === 'structured_log_consumer_unavailable')).to.have.length(1);
        expect(logs().filter((log) => log.logCategory === rpc.RpcLog.RpcLogCategory.User)).to.have.length(3);
    });

    it('does not call getters, mutate inputs or export invalid and reserved attributes', () => {
        const attributes: Record<string, unknown> = {
            stationId: 'Merida',
            zero: 0,
            enabled: false,
            nan: NaN,
            infinity: Infinity,
            negativeInfinity: -Infinity,
            missing: undefined,
            nil: null,
            bigint: BigInt(7),
            nested: {},
            array: [],
            date: new Date(),
            error: new Error('secret'),
            callback: () => {},
            symbol: Symbol('secret'),
            CategoryName: 'secret',
            'EXCEPTION.Type': 'secret',
            'exception.stacktrace': 'secret',
            '_MS.secret': 'secret',
            microsoftSecret: 'secret',
            'AI.operation.id': 'secret',
            constructor: 'secret',
            prototype: 'secret',
        };
        Object.defineProperty(attributes, '__proto__', { value: 'secret', enumerable: true });
        let getterCalls = 0;
        Object.defineProperty(attributes, 'getter', {
            enumerable: true,
            get: () => {
                getterCalls++;
                throw new Error('secret');
            },
        });
        const captured: coreTypes.LogHookContext[] = [];
        coreApi.registerHook('log', (context) => captured.push(context), { structuredLogProperties: true });
        logWithMetadata(attributes);
        expect(getterCalls).to.equal(0);
        expect(attributes.stationId).to.equal('Merida');
        expect(attributes.CategoryName).to.equal('secret');
        const userLog = captured.find((context) => context.category === 'user')!;
        expect(userLog.attributes).to.deep.equal({ stationId: 'Merida', zero: 0, enabled: false });
        const warning = logs().find((log) => log.level === rpc.RpcLog.Level.Warning)!;
        expect(warning.message).to.contain('structured_log_invalid_properties');
        expect(warning.message).not.to.contain('secret');
        expect(logs().filter((log) => log.logCategory === rpc.RpcLog.RpcLogCategory.User)).to.have.length(1);
    });

    it('contains failures from hostile metadata and property maps', () => {
        coreApi.registerHook('log', () => {}, { structuredLogProperties: true });
        const hostile = new Proxy(
            {},
            {
                ownKeys: () => {
                    throw new Error('secret');
                },
            }
        );
        expect(() => logWithMetadata(hostile)).not.to.throw();
        const metadata = Object.defineProperty({}, 'attributes', {
            get: () => {
                throw new Error('secret');
            },
        });
        expect(() => coreApi.log('error', 'user', 'original', metadata as coreTypes.LogMetadata)).not.to.throw();
        expect(logs().filter((log) => log.logCategory === rpc.RpcLog.RpcLogCategory.User)).to.have.length(2);
        expect(logs().filter((log) => log.level === rpc.RpcLog.Level.Warning)).to.have.length(1);
    });

    it('preserves legacy hook mutation and hook-error behavior', () => {
        coreApi.registerHook('log', (context) => {
            context.message += ' changed';
            context.level = 'warning';
        });
        coreApi.log('information', 'user', 'legacy');
        expect(logs()[0].message).to.equal('legacy changed');
        expect(logs()[0].level).to.equal(rpc.RpcLog.Level.Warning);
        coreApi.registerHook(
            'log',
            () => {
                throw new Error('hook failure');
            },
            { structuredLogProperties: true }
        );
        expect(() => coreApi.log('error', 'user', 'original', { attributes: { stationId: 'Merida' } })).not.to.throw();
        expect(logs()[1].message).to.equal('original');
        expect(logs()[1].level).to.equal(rpc.RpcLog.Level.Error);
    });

    it('isolates warnings across invocation preparation and execution', async () => {
        worker.app.isUsingWorkerIndexing = true;
        worker.app.functions.example = { metadata: { name: 'example' }, callback: () => {} };
        worker.app.programmingModel = {
            name: 'early logging test',
            version: '1',
            getInvocationModel: (coreContext) => {
                const emit = () => coreContext.log('error', 'user', 'failure', { attributes: { invalid: NaN } });
                emit();
                return {
                    getArguments: async () => {
                        emit();
                        return { context: { invocationId: coreContext.invocationId }, inputs: [] };
                    },
                    invokeFunction: async () => {
                        emit();
                    },
                    getResponse: async () => ({ invocationId: coreContext.invocationId }),
                };
            },
        };
        await Promise.all(
            ['first', 'second'].map((invocationId) =>
                new InvocationHandler().handleEvent({ invocationId, functionId: 'example' })
            )
        );
        for (const invocationId of ['first', 'second']) {
            const invocationLogs = logs().filter((log) => log.invocationId === invocationId);
            expect(
                invocationLogs.filter((log) => log.message === 'structured_log_consumer_unavailable')
            ).to.have.length(1);
            expect(
                invocationLogs.filter((log) => log.message?.startsWith('structured_log_invalid_properties'))
            ).to.have.length(1);
            expect(invocationLogs.filter((log) => log.logCategory === rpc.RpcLog.RpcLogCategory.User)).to.have.length(
                3
            );
        }
    });

    it('carries attributes and invocation context through real concurrent invocation handlers', async () => {
        const captured: coreTypes.LogHookContext[] = [];
        coreApi.registerHook(
            'log',
            (context) => {
                if (context.category === 'user') captured.push(context);
            },
            { structuredLogProperties: true }
        );
        worker.app.isUsingWorkerIndexing = true;
        worker.app.functions.station = { metadata: { name: 'station' }, callback: () => {} };
        worker.app.programmingModel = {
            name: 'structured logging test',
            version: '1',
            getInvocationModel: (coreContext) => ({
                getArguments: async () => ({ context: { invocationId: coreContext.invocationId }, inputs: [] }),
                invokeFunction: async () => {
                    await Promise.resolve();
                    coreContext.log('error', 'user', `failure ${coreContext.invocationId}`, {
                        attributes: { stationId: coreContext.invocationId },
                    });
                },
                getResponse: async () => ({ invocationId: coreContext.invocationId }),
            }),
        };
        await Promise.all(
            ['Merida', 'Other'].map((invocationId) =>
                new InvocationHandler().handleEvent({ invocationId, functionId: 'station' })
            )
        );
        expect(captured).to.have.length(2);
        for (const context of captured) {
            const invocationId = (context.invocationContext as { invocationId: string }).invocationId;
            expect(context.attributes).to.deep.equal({ stationId: invocationId });
            expect(context.message).to.equal(`failure ${invocationId}`);
        }
        expect(
            logs()
                .filter((log) => log.logCategory === rpc.RpcLog.RpcLogCategory.User)
                .map((log) => log.invocationId)
        ).to.have.members(['Merida', 'Other']);
    });
});
