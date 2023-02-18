// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import * as escapeStringRegexp from 'escape-string-regexp';
import 'mocha';
import { ITestCallbackContext } from 'mocha';
import * as mockFs from 'mock-fs';
import * as semver from 'semver';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { logColdStartWarning } from '../../src/eventHandlers/WorkerInitHandler';
import { WorkerChannel } from '../../src/WorkerChannel';
import { beforeEventHandlerSuite } from './beforeEventHandlerSuite';
import { RegExpStreamingMessage, TestEventStream } from './TestEventStream';
import path = require('path');
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

export namespace Msg {
    export function init(functionAppDirectory: string = __dirname, hostVersion = '2.7.0'): rpc.IStreamingMessage {
        return {
            requestId: 'id',
            workerInitRequest: {
                capabilities: {},
                functionAppDirectory,
                hostVersion,
            },
        };
    }

    const workerMetadataRegExps = {
        'workerInitResponse.workerMetadata.runtimeVersion': /^v[0-9]+\.[0-9]+\.[0-9]+$/,
        'workerInitResponse.workerMetadata.workerBitness': /^(x64|ia32|arm64)$/,
        'workerInitResponse.workerMetadata.workerVersion': /^3\.[0-9]+\.[0-9]+$/,
    };

    export const response = new RegExpStreamingMessage(
        {
            requestId: 'id',
            workerInitResponse: {
                capabilities: {
                    RawHttpBodyBytes: 'true',
                    RpcHttpBodyOnly: 'true',
                    RpcHttpTriggerMetadataRemoved: 'true',
                    IgnoreEmptyValuedRpcHttpHeaders: 'true',
                    UseNullableValueDictionaryForHttp: 'true',
                    WorkerStatus: 'true',
                    TypedDataCollection: 'true',
                    HandlesWorkerTerminateMessage: 'true',
                },
                result: {
                    status: rpc.StatusResult.Status.Success,
                },
                workerMetadata: {
                    runtimeName: 'node',
                },
            },
        },
        workerMetadataRegExps
    );

    export function failedResponse(fileName: string, errorMessage: string): RegExpStreamingMessage {
        const expectedMsg: rpc.IStreamingMessage = {
            requestId: 'id',
            workerInitResponse: {
                result: {
                    status: rpc.StatusResult.Status.Failure,
                    exception: {
                        message: errorMessage,
                    },
                },
                workerMetadata: {
                    runtimeName: 'node',
                },
            },
        };
        return new RegExpStreamingMessage(expectedMsg, {
            'workerInitResponse.result.exception.stackTrace': new RegExp(
                `Error: ${escapeStringRegexp(errorMessage)}\\s*at`
            ),
            ...workerMetadataRegExps,
        });
    }

    export const receivedInitLog: rpc.IStreamingMessage = {
        rpcLog: {
            message: 'Worker 00000000-0000-0000-0000-000000000000 received WorkerInitRequest',
            level: LogLevel.Debug,
            logCategory: LogCategory.System,
        },
    };

    export function loadingEntryPoint(fileName: string): rpc.IStreamingMessage {
        return {
            rpcLog: {
                message: `Loading entry point file "${fileName}"`,
                level: LogLevel.Debug,
                logCategory: LogCategory.System,
            },
        };
    }

    export function loadedEntryPoint(fileName: string): rpc.IStreamingMessage {
        return {
            rpcLog: {
                message: `Loaded entry point file "${fileName}"`,
                level: LogLevel.Debug,
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

    export function error(message: string): rpc.IStreamingMessage {
        return {
            rpcLog: {
                message,
                level: LogLevel.Error,
                logCategory: LogCategory.System,
            },
        };
    }

    export const coldStartWarning: rpc.IStreamingMessage = {
        rpcLog: {
            message:
                'package.json is not found at the root of the Function App in Azure Files - cold start for NodeJs can be affected.',
            level: LogLevel.Debug,
            logCategory: LogCategory.System,
        },
    };
}

describe('WorkerInitHandler', () => {
    let channel: WorkerChannel;
    let stream: TestEventStream;

    before(() => {
        ({ stream, channel } = beforeEventHandlerSuite());
    });

    afterEach(async () => {
        mockFs.restore();
        await stream.afterEachEventHandlerTest();
    });

    it('responds to init', async () => {
        mockFs({ [__dirname]: { 'package.json': '{}' } });
        stream.addTestMessage(Msg.init());
        await stream.assertCalledWith(Msg.receivedInitLog, Msg.response);
    });

    it('does not init for Node.js v8.x and v2 compatability = false', () => {
        const version = process.version;
        if (version.split('.')[0] === 'v8') {
            expect(() => stream.addTestMessage(Msg.init())).to.throw(
                `Incompatible Node.js version (${process.version}). The version of the Azure Functions runtime you are using (v3) supports Node.js v10.x and v12.x. Refer to our documentation to see the Node.js versions supported by each version of Azure Functions: https://aka.ms/functions-node-versions`
            );
        }
    });

    it('logs AzureFiles cold start warning', async () => {
        process.env.WEBSITE_CONTENTAZUREFILECONNECTIONSTRING = 'test';
        process.env.WEBSITE_CONTENTSHARE = 'test';
        process.env.AzureWebJobsScriptRoot = 'test';

        logColdStartWarning(channel, 10);

        await stream.assertCalledWith(Msg.coldStartWarning);
    });

    it('correctly loads package.json file', async () => {
        const appDir = 'appDir';
        const expectedPackageJson = {
            type: 'module',
        };
        mockFs({
            [appDir]: {
                'package.json': JSON.stringify(expectedPackageJson),
            },
        });

        stream.addTestMessage(Msg.init(appDir));
        await stream.assertCalledWith(Msg.receivedInitLog, Msg.response);
        expect(channel.packageJson).to.deep.equal(expectedPackageJson);
    });

    it('loads empty package.json', async () => {
        const appDir = 'appDir';
        mockFs({
            [appDir]: {
                'not-package-json': 'some content',
            },
        });

        stream.addTestMessage(Msg.init(appDir));
        await stream.assertCalledWith(
            Msg.receivedInitLog,
            Msg.warning(`Worker failed to load package.json: file does not exist`),
            Msg.response
        );
        expect(channel.packageJson).to.be.empty;
    });

    it('ignores malformed package.json', async () => {
        const appDir = 'appDir';
        mockFs({
            [appDir]: {
                'package.json': 'gArB@g3 dAtA',
            },
        });

        const jsonError = semver.gte(process.versions.node, '19.0.0')
            ? 'Unexpected token \'g\', "gArB@g3 dAtA" is not valid JSON'
            : 'Unexpected token g in JSON at position 0';

        stream.addTestMessage(Msg.init(appDir));
        await stream.assertCalledWith(
            Msg.receivedInitLog,
            Msg.warning(
                `Worker failed to load package.json: file content is not valid JSON: ${path.join(
                    appDir,
                    'package.json'
                )}: ${jsonError}`
            ),
            Msg.response
        );
        expect(channel.packageJson).to.be.empty;
    });

    for (const extension of ['.js', '.mjs', '.cjs']) {
        it(`Loads entry point (${extension}) in non-specialization scenario`, async () => {
            const fileName = `entryPointFiles/doNothing${extension}`;
            const expectedPackageJson = {
                main: fileName,
            };
            mockFs({
                [__dirname]: {
                    'package.json': JSON.stringify(expectedPackageJson),
                    // 'require' and 'mockFs' don't play well together so we need these files in both the mock and real file systems
                    entryPointFiles: mockFs.load(path.join(__dirname, 'entryPointFiles')),
                },
            });

            stream.addTestMessage(Msg.init(__dirname));
            await stream.assertCalledWith(
                Msg.receivedInitLog,
                Msg.loadingEntryPoint(fileName),
                Msg.loadedEntryPoint(fileName),
                Msg.response
            );
        });
    }

    it(`Loads entry point with glob`, async () => {
        const main = `entryPointFiles/doNothing*.js`;
        const expectedPackageJson = {
            main,
        };
        mockFs({
            [__dirname]: {
                'package.json': JSON.stringify(expectedPackageJson),
                // 'require' and 'mockFs' don't play well together so we need these files in both the mock and real file systems
                entryPointFiles: mockFs.load(path.join(__dirname, 'entryPointFiles')),
            },
        });

        const file1 = 'entryPointFiles/doNothing.js';
        const file2 = 'entryPointFiles/doNothing2.js';

        stream.addTestMessage(Msg.init(__dirname));
        await stream.assertCalledWith(
            Msg.receivedInitLog,
            Msg.loadingEntryPoint(file1),
            Msg.loadedEntryPoint(file1),
            Msg.loadingEntryPoint(file2),
            Msg.loadedEntryPoint(file2),
            Msg.response
        );
    });

    it('Fails for missing entry point', async function (this: ITestCallbackContext) {
        const fileName = 'entryPointFiles/missing.js';
        const expectedPackageJson = {
            main: fileName,
        };
        mockFs({
            [__dirname]: {
                'package.json': JSON.stringify(expectedPackageJson),
            },
        });

        stream.addTestMessage(Msg.init(__dirname));
        const warningMessage = `Worker was unable to load entry point "${fileName}": Found zero files matching the supplied pattern`;
        await stream.assertCalledWith(Msg.receivedInitLog, Msg.warning(warningMessage), Msg.response);
    });

    it('Fails for invalid entry point', async function (this: ITestCallbackContext) {
        const fileName = 'entryPointFiles/throwError.js';
        const expectedPackageJson = {
            main: fileName,
        };
        mockFs({
            [__dirname]: {
                'package.json': JSON.stringify(expectedPackageJson),
                // 'require' and 'mockFs' don't play well together so we need these files in both the mock and real file systems
                entryPointFiles: mockFs.load(path.join(__dirname, 'entryPointFiles')),
            },
        });

        stream.addTestMessage(Msg.init(__dirname));
        const warningMessage = `Worker was unable to load entry point "${fileName}": test`;
        await stream.assertCalledWith(
            Msg.receivedInitLog,
            Msg.loadingEntryPoint(fileName),
            Msg.warning(warningMessage),
            Msg.response
        );
    });
});
