// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as coreTypes from '@azure/functions-core';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { WorkerChannel } from '../src/WorkerChannel';
import { beforeEventHandlerSuite } from './eventHandlers/beforeEventHandlerSuite';
import { TestEventStream } from './eventHandlers/TestEventStream';
import { Msg as WorkerInitMsg } from './eventHandlers/WorkerInitHandler.test';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

namespace Msg {
    export function executingHooksLog(count: number, hookName: string): rpc.IStreamingMessage {
        return {
            rpcLog: {
                category: undefined,
                invocationId: undefined,
                message: `Executing ${count} "${hookName}" hooks`,
                level: LogLevel.Debug,
                logCategory: LogCategory.System,
            },
        };
    }
    export function executedHooksLog(hookName: string): rpc.IStreamingMessage {
        return {
            rpcLog: {
                category: undefined,
                invocationId: undefined,
                message: `Executed "${hookName}" hooks`,
                level: LogLevel.Debug,
                logCategory: LogCategory.System,
            },
        };
    }
}

describe('appStartup', () => {
    let channel: WorkerChannel;
    let stream: TestEventStream;
    let coreApi: typeof coreTypes;
    let testDisposables: coreTypes.Disposable[] = [];

    before(async () => {
        ({ stream, channel } = beforeEventHandlerSuite());
        coreApi = await import('@azure/functions-core');
    });

    afterEach(async () => {
        await stream.afterEachEventHandlerTest();
        coreApi.Disposable.from(...testDisposables).dispose();
        testDisposables = [];
    });

    it('runs app startup hooks in non-specialization scenario', async () => {
        const hostVersion = '2.7.0';
        const functionAppDirectory = __dirname;
        const expectedStartupContext: coreTypes.AppStartupContext = {
            functionAppDirectory,
            hostVersion,
            hookData: {},
        };

        const startupFunc = sinon.spy();
        testDisposables.push(coreApi.registerHook('appStartup', startupFunc));

        stream.addTestMessage(WorkerInitMsg.init(functionAppDirectory, hostVersion));

        await stream.assertCalledWith(
            WorkerInitMsg.receivedInitLog,
            WorkerInitMsg.warning('Worker failed to load package.json: file does not exist'),
            Msg.executingHooksLog(1, 'appStartup'),
            Msg.executedHooksLog('appStartup'),
            WorkerInitMsg.response
        );

        expect(startupFunc.callCount).to.be.equal(1);
        expect(startupFunc.args[0][0]).to.deep.equal(expectedStartupContext);
        expect(channel.packageJson).to.be.empty;
    });
    it('runs app startup hooks only once in specialiation scenario', () => {});
    it('persists hookData changes from app startup hooks in worker channel', () => {});
    it('passes app startup hookData changes to invocation hooks', () => {});
    it('does not persist invocation hooks hookData changes', () => {});
});
