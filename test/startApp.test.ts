// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as coreTypes from '@azure/functions-core';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { WorkerChannel } from '../src/WorkerChannel';
import { beforeEventHandlerSuite } from './eventHandlers/beforeEventHandlerSuite';
import { Msg as EnvReloadMsg } from './eventHandlers/FunctionEnvironmentReloadHandler.test';
import { TestEventStream } from './eventHandlers/TestEventStream';
import { Msg as WorkerInitMsg } from './eventHandlers/WorkerInitHandler.test';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

export namespace Msg {
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

describe('startApp', () => {
    let channel: WorkerChannel;
    let stream: TestEventStream;
    let coreApi: typeof coreTypes;
    let testDisposables: coreTypes.Disposable[] = [];

    before(async () => {
        ({ stream, channel } = beforeEventHandlerSuite());
        coreApi = await import('@azure/functions-core');
    });

    afterEach(async () => {
        coreApi.Disposable.from(...testDisposables).dispose();
        testDisposables = [];
        channel.appHookData = {};
        channel.appLevelOnlyHookData = {};
        await stream.afterEachEventHandlerTest();
    });

    it('runs app start hooks in non-specialization scenario', async () => {
        const hostVersion = '2.7.0';
        const functionAppDirectory = __dirname;
        const expectedStartContext: coreTypes.AppStartContext = {
            functionAppDirectory,
            hookData: {},
            appHookData: {},
        };

        const startFunc = sinon.spy();
        testDisposables.push(coreApi.registerHook('appStart', startFunc));

        stream.addTestMessage(WorkerInitMsg.init(functionAppDirectory, hostVersion));

        await stream.assertCalledWith(
            WorkerInitMsg.receivedInitLog,
            WorkerInitMsg.warning('Worker failed to load package.json: file does not exist'),
            Msg.executingHooksLog(1, 'appStart'),
            Msg.executedHooksLog('appStart'),
            WorkerInitMsg.response
        );

        expect(startFunc.callCount).to.be.equal(1);
        expect(startFunc.args[0][0]).to.deep.equal(expectedStartContext);
    });

    it('runs app start hooks only once in specialiation scenario', async () => {
        const hostVersion = '2.7.0';
        const functionAppDirectory = __dirname;
        const expectedStartContext: coreTypes.AppStartContext = {
            functionAppDirectory,
            hookData: {},
            appHookData: {},
        };
        const startFunc = sinon.spy();

        stream.addTestMessage(WorkerInitMsg.init(functionAppDirectory, hostVersion));
        await stream.assertCalledWith(
            WorkerInitMsg.receivedInitLog,
            WorkerInitMsg.warning('Worker failed to load package.json: file does not exist'),
            WorkerInitMsg.response
        );

        testDisposables.push(coreApi.registerHook('appStart', startFunc));

        stream.addTestMessage({
            requestId: 'id',
            functionEnvironmentReloadRequest: {
                functionAppDirectory,
            },
        });
        await stream.assertCalledWith(
            EnvReloadMsg.reloadEnvVarsLog(0),
            EnvReloadMsg.changingCwdLog(functionAppDirectory),
            WorkerInitMsg.warning('Worker failed to load package.json: file does not exist'),
            Msg.executingHooksLog(1, 'appStart'),
            Msg.executedHooksLog('appStart'),
            EnvReloadMsg.reloadSuccess
        );

        expect(startFunc.callCount).to.be.equal(1);
        expect(startFunc.args[0][0]).to.deep.equal(expectedStartContext);
    });

    it('allows different appStart hooks to share data', async () => {
        const functionAppDirectory = __dirname;
        let hookData = '';
        testDisposables.push(
            coreApi.registerHook('appStart', (context) => {
                context.hookData.hello = 'world';
                hookData += 'start1';
            })
        );
        testDisposables.push(
            coreApi.registerHook('appStart', (context) => {
                expect(context.hookData.hello).to.equal('world');
                hookData += 'start2';
            })
        );

        stream.addTestMessage(WorkerInitMsg.init(functionAppDirectory));

        await stream.assertCalledWith(
            WorkerInitMsg.receivedInitLog,
            WorkerInitMsg.warning('Worker failed to load package.json: file does not exist'),
            Msg.executingHooksLog(2, 'appStart'),
            Msg.executedHooksLog('appStart'),
            WorkerInitMsg.response
        );

        expect(hookData).to.equal('start1start2');
    });
});
