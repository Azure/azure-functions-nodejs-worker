// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as coreTypes from '@azure/functions-core';
import { expect } from 'chai';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { WorkerChannel } from '../../src/WorkerChannel';
import { Msg as AppStartMsg } from '../startApp.test';
import { beforeEventHandlerSuite } from './beforeEventHandlerSuite';
import { TestEventStream } from './TestEventStream';
import sinon = require('sinon');
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

namespace Msg {
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
    let coreApi: typeof coreTypes;
    let testDisposables: coreTypes.Disposable[] = [];

    before(async () => {
        ({ channel, stream } = beforeEventHandlerSuite());
        processExitStub = sinon.stub(process, 'exit');
        coreApi = await import('@azure/functions-core');
    });

    afterEach(async () => {
        coreApi.Disposable.from(...testDisposables).dispose();
        testDisposables = [];
        channel.appHookData = {};
        channel.appLevelOnlyHookData = {};
        await stream.afterEachEventHandlerTest();
    });

    after(() => {
        processExitStub.restore();
    });

    it('handles worker_terminate request', async () => {
        stream.addTestMessage(Msg.workerTerminate());
        await stream.assertCalledWith(Msg.receivedWorkerTerminateLog);
        expect(processExitStub.calledWith(0)).to.be.true;
    });

    it('shuts down worker in response to worker_termiante request', async () => {
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
});
