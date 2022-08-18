// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import 'mocha';
import * as mock from 'mock-fs';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { WorkerChannel } from '../../src/WorkerChannel';
import { beforeEventHandlerSuite } from './beforeEventHandlerSuite';
import { TestEventStream } from './TestEventStream';
import { Msg as WorkerInitMsg } from './WorkerInitHandler.test';
import path = require('path');
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

export namespace Msg {
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

    export function changingCwdLog(dir = '/'): rpc.IStreamingMessage {
        return {
            rpcLog: {
                message: `Changing current working directory to ${dir}`,
                level: LogLevel.Information,
                logCategory: LogCategory.System,
            },
        };
    }

    export function warning(message: string): rpc.IStreamingMessage {
        return {
            rpcLog: {
                message,
                level: LogLevel.Warning,
                logCategory: LogCategory.System,
            },
        };
    }

    export const noPackageJsonWarning: rpc.IStreamingMessage = warning(
        `Worker failed to load package.json: file does not exist`
    );
}

describe('FunctionEnvironmentReloadHandler', () => {
    let stream: TestEventStream;
    let channel: WorkerChannel;

    before(() => {
        ({ stream, channel } = beforeEventHandlerSuite());
        channel.hostVersion = '2.7.0';
    });

    afterEach(async () => {
        mock.restore();
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

    it('preserves OS-specific casing behavior of environment variables', async () => {
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
        expect(process.env.placeholdervariable).to.be.undefined;
        if (process.platform === 'win32') {
            expect(process.env.HeLlO).to.equal('world');
            expect(process.env.systemdrive).to.equal('Q:');
        } else {
            expect(process.env.HeLlO).to.be.undefined;
            expect(process.env.systemdrive).to.be.undefined;
        }
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

        await stream.assertCalledWith(
            Msg.reloadEnvVarsLog(2),
            Msg.changingCwdLog(),
            Msg.noPackageJsonWarning,
            Msg.reloadSuccess
        );
        expect(process.env.hello).to.equal('world');
        expect(process.env.SystemDrive).to.equal('Q:');
        expect(process.cwd() != newDir);
        expect(process.cwd() == newDir);
        process.chdir(cwd);
    });

    it('reloads package.json', async () => {
        const cwd = process.cwd();
        const oldDir = 'oldDir';
        const oldDirAbsolute = path.join(cwd, oldDir);
        const newDir = 'newDir';
        const newDirAbsolute = path.join(cwd, newDir);
        const oldPackageJson = {
            type: 'module',
            hello: 'world',
        };
        const newPackageJson = {
            type: 'commonjs',
            notHello: 'notWorld',
        };
        mock({
            [oldDir]: {
                'package.json': JSON.stringify(oldPackageJson),
            },
            [newDir]: {
                'package.json': JSON.stringify(newPackageJson),
            },
        });

        stream.addTestMessage({
            requestId: 'id',
            functionEnvironmentReloadRequest: {
                functionAppDirectory: oldDirAbsolute,
            },
        });
        await stream.assertCalledWith(Msg.reloadEnvVarsLog(0), Msg.changingCwdLog(oldDirAbsolute), Msg.reloadSuccess);
        expect(channel.packageJson).to.deep.equal(oldPackageJson);

        stream.addTestMessage({
            requestId: 'id',
            functionEnvironmentReloadRequest: {
                functionAppDirectory: newDirAbsolute,
            },
        });
        await stream.assertCalledWith(Msg.reloadEnvVarsLog(0), Msg.changingCwdLog(newDirAbsolute), Msg.reloadSuccess);
        expect(channel.packageJson).to.deep.equal(newPackageJson);
    });

    it('correctly loads package.json in specialization scenario', async () => {
        const cwd = process.cwd();
        const tempDir = 'temp';
        const appDir = 'app';
        const packageJson = {
            type: 'module',
            hello: 'world',
        };

        mock({
            [tempDir]: {},
            [appDir]: {
                'package.json': JSON.stringify(packageJson),
            },
        });

        stream.addTestMessage(WorkerInitMsg.init(path.join(cwd, tempDir)));
        await stream.assertCalledWith(
            WorkerInitMsg.receivedInitLog,
            WorkerInitMsg.warning(`Worker failed to load package.json: file does not exist`),
            WorkerInitMsg.response
        );
        expect(channel.packageJson).to.be.empty;

        stream.addTestMessage({
            requestId: 'id',
            functionEnvironmentReloadRequest: {
                functionAppDirectory: path.join(cwd, appDir),
            },
        });
        await stream.assertCalledWith(
            Msg.reloadEnvVarsLog(0),
            Msg.changingCwdLog(path.join(cwd, appDir)),
            Msg.reloadSuccess
        );
        expect(channel.packageJson).to.deep.equal(packageJson);
    });

    for (const extension of ['.js', '.mjs', '.cjs']) {
        it(`Loads entry point (${extension}) in specialization scenario`, async () => {
            const cwd = process.cwd();
            const tempDir = 'temp';
            const fileName = `entryPointFiles/doNothing${extension}`;
            const expectedPackageJson = {
                main: fileName,
            };
            mock({
                [tempDir]: {},
                [__dirname]: {
                    'package.json': JSON.stringify(expectedPackageJson),
                    // 'require' and 'mockFs' don't play well together so we need these files in both the mock and real file systems
                    entryPointFiles: mock.load(path.join(__dirname, 'entryPointFiles')),
                },
            });

            stream.addTestMessage(WorkerInitMsg.init(path.join(cwd, tempDir)));
            await stream.assertCalledWith(
                WorkerInitMsg.receivedInitLog,
                WorkerInitMsg.warning('Worker failed to load package.json: file does not exist'),
                WorkerInitMsg.response
            );

            stream.addTestMessage({
                requestId: 'id',
                functionEnvironmentReloadRequest: {
                    functionAppDirectory: __dirname,
                },
            });
            await stream.assertCalledWith(
                Msg.reloadEnvVarsLog(0),
                Msg.changingCwdLog(__dirname),
                WorkerInitMsg.loadingEntryPoint(fileName),
                WorkerInitMsg.loadedEntryPoint(fileName),
                Msg.reloadSuccess
            );
        });
    }
});
