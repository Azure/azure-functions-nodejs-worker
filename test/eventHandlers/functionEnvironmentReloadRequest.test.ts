// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import 'mocha';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { beforeEventHandlerSuite } from './beforeEventHandlerSuite';
import { TestEventStream } from './TestEventStream';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

namespace Msg {
    export function reloadEnvVarsLog(numVars: number): rpc.IStreamingMessage {
        return {
            rpcLog: {
                message: `Reloading environment variables. Found ${numVars} variables to reload.`,
                level: LogLevel.Information,
                logCategory: LogCategory.System,
            },
        };
    }

    export const reloadSuccess: rpc.IStreamingMessage = {
        requestId: 'id',
        functionEnvironmentReloadResponse: {
            result: {
                status: rpc.StatusResult.Status.Success,
            },
        },
    };

    export const noHandlerRpcLog: rpc.IStreamingMessage = {
        rpcLog: {
            message: "Worker workerId had no handler for message 'undefined'",
            level: LogLevel.Error,
            logCategory: LogCategory.System,
        },
    };

    export const changingCwdLog: rpc.IStreamingMessage = {
        rpcLog: {
            message: `Changing current working directory to /`,
            level: LogLevel.Information,
            logCategory: LogCategory.System,
        },
    };
}

describe('functionEnvironmentReloadRequest', () => {
    let stream: TestEventStream;

    // Reset `process.env` after this test suite so it doesn't affect other tests
    let originalEnv: NodeJS.ProcessEnv;
    before(() => {
        originalEnv = process.env;
        ({ stream } = beforeEventHandlerSuite());
    });

    after(() => {
        process.env = originalEnv;
    });

    afterEach(async () => {
        await stream.afterEachEventHandlerTest();
    });

    it('reloads environment variables', async () => {
        process.env.PlaceholderVariable = 'TRUE';
        stream.addTestMessage({
            requestId: 'id',
            functionEnvironmentReloadRequest: {
                environmentVariables: {
                    hello: 'world',
                    SystemDrive: 'Q:',
                },
                functionAppDirectory: null,
            },
        });
        await stream.assertCalledWith(Msg.reloadEnvVarsLog(2), Msg.reloadSuccess);
        expect(process.env.hello).to.equal('world');
        expect(process.env.SystemDrive).to.equal('Q:');
        expect(process.env.PlaceholderVariable).to.be.undefined;
    });

    it('reloading environment variables removes existing environment variables', async () => {
        process.env.PlaceholderVariable = 'TRUE';
        process.env.NODE_ENV = 'Debug';
        stream.addTestMessage({
            requestId: 'id',
            functionEnvironmentReloadRequest: {
                environmentVariables: {},
                functionAppDirectory: null,
            },
        });
        await stream.assertCalledWith(Msg.reloadEnvVarsLog(0), Msg.reloadSuccess);
        expect(process.env).to.be.empty;
    });

    it('reloads empty environment variables', async () => {
        stream.addTestMessage({
            requestId: 'id',
            functionEnvironmentReloadRequest: {
                environmentVariables: {},
                functionAppDirectory: null,
            },
        });
        await stream.assertCalledWith(Msg.reloadEnvVarsLog(0), Msg.reloadSuccess);

        stream.addTestMessage({
            requestId: 'id',
            functionEnvironmentReloadRequest: null,
        });

        await stream.assertCalledWith(Msg.noHandlerRpcLog);

        stream.addTestMessage({
            requestId: 'id',
            functionEnvironmentReloadRequest: {
                environmentVariables: null,
                functionAppDirectory: null,
            },
        });
        await stream.assertCalledWith(Msg.reloadEnvVarsLog(0), Msg.reloadSuccess);
    });

    it('reloads environment variable and keeps cwd without functionAppDirectory', async () => {
        const cwd = process.cwd();
        stream.addTestMessage({
            requestId: 'id',
            functionEnvironmentReloadRequest: {
                environmentVariables: {
                    hello: 'world',
                    SystemDrive: 'Q:',
                },
                functionAppDirectory: null,
            },
        });
        await stream.assertCalledWith(Msg.reloadEnvVarsLog(2), Msg.reloadSuccess);
        expect(process.env.hello).to.equal('world');
        expect(process.env.SystemDrive).to.equal('Q:');
        expect(process.cwd() == cwd);
    });

    it('reloads environment variable and changes functionAppDirectory', async () => {
        const cwd = process.cwd();
        const newDir = '/';
        stream.addTestMessage({
            requestId: 'id',
            functionEnvironmentReloadRequest: {
                environmentVariables: {
                    hello: 'world',
                    SystemDrive: 'Q:',
                },
                functionAppDirectory: newDir,
            },
        });

        await stream.assertCalledWith(Msg.reloadEnvVarsLog(2), Msg.changingCwdLog, Msg.reloadSuccess);
        expect(process.env.hello).to.equal('world');
        expect(process.env.SystemDrive).to.equal('Q:');
        expect(process.cwd() != newDir);
        expect(process.cwd() == newDir);
        process.chdir(cwd);
    });
});
