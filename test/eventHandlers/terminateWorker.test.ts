// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as coreTypes from '@azure/functions-core';
import { expect } from 'chai';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { WorkerChannel } from '../../src/WorkerChannel';
import { Msg as AppStartMsg } from '../startApp.test';
import { beforeEventHandlerSuite } from './beforeEventHandlerSuite';
import { TestEventStream } from './TestEventStream';
import { Msg as WorkerInitMsg } from './WorkerInitHandler.test';
import sinon = require('sinon');
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

export namespace Msg {
    export function workerTerminate(gracePeriodSeconds = 5): rpc.IStreamingMessage {
        return {
            workerTerminate: {
                gracePeriod: {
                    seconds: gracePeriodSeconds,
                },
            },
        };
    }

    export const receivedWorkerTerminateLog: rpc.IStreamingMessage = {
        rpcLog: {
            message: 'Received workerTerminate message; gracefully shutting down worker',
            level: LogLevel.Debug,
            logCategory: LogCategory.System,
        },
    };
}

describe('terminateWorker', () => {
    let stream: TestEventStream;
    let channel: WorkerChannel;
    let processExitStub: sinon.SinonStub;
    let streamEndStub: sinon.SinonStub;
    let coreApi: typeof coreTypes;
    let testDisposables: coreTypes.Disposable[] = [];

    before(async () => {
        ({ channel, stream } = beforeEventHandlerSuite());
        processExitStub = sinon.stub(process, 'exit');
        streamEndStub = sinon.stub(channel.eventStream, 'end');
        coreApi = await import('@azure/functions-core');
    });

    afterEach(async () => {
        coreApi.Disposable.from(...testDisposables).dispose();
        testDisposables = [];
        channel.appHookData = {};
        channel.appLevelOnlyHookData = {};
        processExitStub.resetHistory();
        streamEndStub.resetHistory();
        await stream.afterEachEventHandlerTest();
    });

    after(() => {
        processExitStub.restore();
    });

    it('handles worker_terminate request', async () => {
        stream.addTestMessage(Msg.workerTerminate());
        await stream.assertCalledWith(Msg.receivedWorkerTerminateLog);
    });

    it('ends event stream', async () => {
        stream.addTestMessage(Msg.workerTerminate());
        await stream.assertCalledWith(Msg.receivedWorkerTerminateLog);
        expect(streamEndStub.callCount).to.be.equal(1);
    });

    it('shuts down worker process', async () => {
        stream.addTestMessage(Msg.workerTerminate());
        await stream.assertCalledWith(Msg.receivedWorkerTerminateLog);
        expect(processExitStub.calledWith(0)).to.be.true;
    });

    it('runs app termiante hooks', async () => {
        const gracePeriod = 5;
        const expectedContext: coreTypes.AppTerminateContext = {
            gracePeriod,
            hookData: {},
            appHookData: {},
        };
        const hookFunc = sinon.spy();
        testDisposables.push(coreApi.registerHook('appTerminate', hookFunc));

        stream.addTestMessage(Msg.workerTerminate(gracePeriod));
        await stream.assertCalledWith(
            Msg.receivedWorkerTerminateLog,
            AppStartMsg.executingHooksLog(1, 'appTerminate'),
            AppStartMsg.executedHooksLog('appTerminate')
        );
        expect(hookFunc.callCount).to.be.equal(1);
        expect(hookFunc.args[0][0]).to.deep.equal(expectedContext);
    });

    it('allows app terminate hooks to share data', async () => {
        let hookData = '';
        testDisposables.push(
            coreApi.registerHook('appTerminate', (context) => {
                context.hookData.hello = 'world';
                context.appHookData.foo = 'bar';
                hookData += 'term1';
            })
        );
        testDisposables.push(
            coreApi.registerHook('appTerminate', (context) => {
                expect(context.hookData.hello).to.equal('world');
                expect(context.appHookData.foo).to.equal('bar');
                hookData += 'term2';
            })
        );

        stream.addTestMessage(Msg.workerTerminate());
        await stream.assertCalledWith(
            Msg.receivedWorkerTerminateLog,
            AppStartMsg.executingHooksLog(2, 'appTerminate'),
            AppStartMsg.executedHooksLog('appTerminate')
        );
        expect(hookData).to.equal('term1term2');
    });

    it('allows app start and app terminate hooks to share data', async () => {
        let hookData = '';
        testDisposables.push(
            coreApi.registerHook('appStart', (context) => {
                context.hookData.hello = 'world';
                context.appHookData.foo = 'bar';
                hookData += 'start';
            })
        );
        testDisposables.push(
            coreApi.registerHook('appTerminate', (context) => {
                expect(context.hookData.hello).to.equal('world');
                expect(context.appHookData.foo).to.equal('bar');
                hookData += 'term';
            })
        );

        stream.addTestMessage(WorkerInitMsg.init());
        await stream.assertCalledWith(
            WorkerInitMsg.receivedInitLog,
            WorkerInitMsg.warning('Worker failed to load package.json: file does not exist'),
            AppStartMsg.executingHooksLog(1, 'appStart'),
            AppStartMsg.executedHooksLog('appStart'),
            WorkerInitMsg.response
        );

        stream.addTestMessage(Msg.workerTerminate());
        await stream.assertCalledWith(
            Msg.receivedWorkerTerminateLog,
            AppStartMsg.executingHooksLog(1, 'appTerminate'),
            AppStartMsg.executedHooksLog('appTerminate')
        );

        expect(hookData).to.equal('startterm');
    });

    it('enforces readonly property of hookData and appHookData in hook contexts', async () => {
        testDisposables.push(
            coreApi.registerHook('appTerminate', (context) => {
                expect(() => {
                    // @ts-expect-error: setting readonly property
                    context.hookData = {
                        hello: 'world',
                    };
                }).to.throw('Attempting to set readonly property hookData');
                expect(() => {
                    // @ts-expect-error: setting readonly property
                    context.appHookData = {
                        hello: 'world',
                    };
                }).to.throw('Attempting to set readonly property appHookData');
            })
        );

        stream.addTestMessage(Msg.workerTerminate());

        await stream.assertCalledWith(
            Msg.receivedWorkerTerminateLog,
            AppStartMsg.executingHooksLog(1, 'appTerminate'),
            AppStartMsg.executedHooksLog('appTerminate')
        );
    });
});
