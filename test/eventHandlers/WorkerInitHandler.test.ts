// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as coreTypes from '@azure/functions-core';
import { expect } from 'chai';
import * as fs from 'fs/promises';
import 'mocha';
import { IHookCallbackContext, ITestCallbackContext } from 'mocha';
import { worker } from '../../src/WorkerContext';
import { logColdStartWarning } from '../../src/eventHandlers/WorkerInitHandler';
import { isNode20Plus } from '../../src/utils/util';
import { TestEventStream } from './TestEventStream';
import { beforeEventHandlerSuite } from './beforeEventHandlerSuite';
import { msg } from './msg';
import { setTestAppMainField, testAppPath, testPackageJsonPath } from './testAppUtils';

describe('WorkerInitHandler', () => {
    let stream: TestEventStream;
    let coreApi: typeof coreTypes;

    before(async () => {
        stream = beforeEventHandlerSuite();
        coreApi = await import('@azure/functions-core');
    });

    afterEach(async () => {
        await stream.afterEachEventHandlerTest();
    });

    it('responds to init', async () => {
        stream.addTestMessage(msg.init.request(testAppPath));
        await stream.assertCalledWith(msg.init.receivedRequestLog, msg.init.response);
    });

    it('does not init for Node.js v8.x and v2 compatability = false', () => {
        const version = process.version;
        if (version.split('.')[0] === 'v8') {
            expect(() => stream.addTestMessage(msg.init.request())).to.throw(
                `Incompatible Node.js version (${process.version}). The version of the Azure Functions runtime you are using (v3) supports Node.js v10.x and v12.x. Refer to our documentation to see the Node.js versions supported by each version of Azure Functions: https://aka.ms/functions-node-versions`
            );
        }
    });

    it('logs AzureFiles cold start warning', async () => {
        process.env.WEBSITE_CONTENTAZUREFILECONNECTIONSTRING = 'test';
        process.env.WEBSITE_CONTENTSHARE = 'test';
        process.env.AzureWebJobsScriptRoot = 'test';

        logColdStartWarning(10);

        await stream.assertCalledWith(msg.init.coldStartWarning);
    });

    it('loads package.json (non-placeholder scenario)', async () => {
        const expectedPackageJson = {
            type: 'module',
        };
        await fs.writeFile(testPackageJsonPath, JSON.stringify(expectedPackageJson));

        stream.addTestMessage(msg.init.request(testAppPath));
        await stream.assertCalledWith(msg.init.receivedRequestLog, msg.init.response);
        expect(worker.app.packageJson).to.deep.equal(expectedPackageJson);
    });

    it('loads empty package.json', async () => {
        stream.addTestMessage(msg.init.request('folderWithoutPackageJson'));
        await stream.assertCalledWith(msg.init.receivedRequestLog, msg.noPackageJsonWarning, msg.init.response);
        expect(worker.app.packageJson).to.be.empty;
    });

    it('ignores malformed package.json', async () => {
        await fs.writeFile(testPackageJsonPath, 'gArB@g3 dAtA');

        const jsonError = isNode20Plus()
            ? 'Unexpected token \'g\', "gArB@g3 dAtA" is not valid JSON'
            : 'Unexpected token g in JSON at position 0';

        stream.addTestMessage(msg.init.request(testAppPath));
        await stream.assertCalledWith(
            msg.init.receivedRequestLog,
            msg.warningLog(
                `Worker failed to load package.json: file content is not valid JSON: ${testPackageJsonPath}: ${jsonError}`
            ),
            msg.init.response
        );
        expect(worker.app.packageJson).to.be.empty;
    });

    for (const extension of ['.js', '.mjs', '.cjs']) {
        it(`Loads entry point (${extension}) (non-placeholder scenario)`, async () => {
            const fileSubpath = await setTestAppMainField(`doNothing${extension}`);

            stream.addTestMessage(msg.init.request(testAppPath));
            await stream.assertCalledWith(
                msg.init.receivedRequestLog,
                msg.loadingEntryPoint(fileSubpath),
                msg.loadedEntryPoint(fileSubpath),
                msg.init.response
            );
        });
    }

    it(`Loads entry point with glob`, async () => {
        await setTestAppMainField('doNothing*.js');

        const file1 = 'src/doNothing.js';
        const file2 = 'src/doNothing2.js';

        stream.addTestMessage(msg.init.request(testAppPath));
        await stream.assertCalledWith(
            msg.init.receivedRequestLog,
            msg.loadingEntryPoint(file1),
            msg.loadedEntryPoint(file1),
            msg.loadingEntryPoint(file2),
            msg.loadedEntryPoint(file2),
            msg.init.response
        );
    });

    describe('entry point error', () => {
        async function verifyAppStartSucceedsAndLogsError(
            isModelV4: boolean,
            fileSubpath?: string,
            errorMessage?: string
        ): Promise<void> {
            fileSubpath ||= await setTestAppMainField('throwError.js');
            errorMessage ||= `Worker was unable to load entry point "${fileSubpath}": test`;

            stream.addTestMessage(msg.init.request(testAppPath));
            if (fileSubpath.includes('missing')) {
                await stream.assertCalledWith(
                    msg.init.receivedRequestLog,
                    msg.errorLog(errorMessage),
                    msg.init.response
                );
            } else {
                await stream.assertCalledWith(
                    msg.init.receivedRequestLog,
                    msg.loadingEntryPoint(fileSubpath),
                    msg.errorLog(errorMessage),
                    msg.init.response
                );
            }

            stream.addTestMessage(msg.indexing.request);
            await stream.assertCalledWith(msg.indexing.receivedRequestLog, msg.indexing.response([], !isModelV4));

            stream.addTestMessage(msg.funcLoad.request('helloWorld.js'));
            await stream.assertCalledWith(msg.funcLoad.receivedRequestLog, msg.funcLoad.response);
        }

        async function verifyAppStartFails(
            isModelV4: boolean,
            fileSubpath?: string,
            errorMessage?: string
        ): Promise<void> {
            fileSubpath ||= await setTestAppMainField('throwError.js');
            errorMessage ||= `Worker was unable to load entry point "${fileSubpath}": test`;

            stream.addTestMessage(msg.init.request(testAppPath));
            if (fileSubpath.includes('missing')) {
                await stream.assertCalledWith(msg.init.receivedRequestLog, msg.init.response);
            } else {
                await stream.assertCalledWith(
                    msg.init.receivedRequestLog,
                    msg.loadingEntryPoint(fileSubpath),
                    msg.init.response
                );
            }

            stream.addTestMessage(msg.indexing.request);
            if (isModelV4) {
                await stream.assertCalledWith(
                    msg.indexing.receivedRequestLog,
                    msg.errorLog(errorMessage),
                    msg.indexing.failedResponse(errorMessage, false)
                );
            } else {
                await stream.assertCalledWith(msg.indexing.receivedRequestLog, msg.indexing.response([], true));
            }

            stream.addTestMessage(msg.funcLoad.request('helloWorld.js'));
            await stream.assertCalledWith(
                msg.funcLoad.receivedRequestLog,
                msg.errorLog(errorMessage),
                msg.funcLoad.failedResponse(errorMessage)
            );
        }

        describe('Node >=v20', () => {
            before(function (this: IHookCallbackContext) {
                if (!isNode20Plus()) {
                    this.skip();
                }
            });

            it('Fails for missing entry point file', async () => {
                const fileSubpath = await setTestAppMainField('missing.js');
                const message = `Worker was unable to load entry point "${fileSubpath}": File does not exist`;
                await verifyAppStartFails(false, fileSubpath, message);
            });

            it('Fails for missing entry point glob pattern', async () => {
                const fileSubpath = await setTestAppMainField('missing/*.js');
                const message = `Worker was unable to load entry point "${fileSubpath}": Found zero files matching the supplied pattern`;
                await verifyAppStartFails(false, fileSubpath, message);
            });

            it('fails (v3)', async function (this: ITestCallbackContext) {
                await verifyAppStartFails(false);
            });

            it('fails (v3) (app setting=0)', async function (this: ITestCallbackContext) {
                process.env.FUNCTIONS_NODE_BLOCK_ON_ENTRY_POINT_ERROR = '0';
                await verifyAppStartFails(false);
            });

            it('fails (v4) (app setting=0)', async () => {
                worker.app.programmingModel = <any>{ name: '@azure/functions', version: '4.0.0' };
                worker.app.isUsingWorkerIndexing = true;
                process.env.FUNCTIONS_NODE_BLOCK_ON_ENTRY_POINT_ERROR = '0';
                await verifyAppStartFails(true);
            });

            it('fails (v4)', async () => {
                worker.app.programmingModel = <any>{ name: '@azure/functions', version: '4.0.0' };
                worker.app.isUsingWorkerIndexing = true;
                await verifyAppStartFails(true);
            });

            it('fails (v4) (app setting=1)', async () => {
                worker.app.programmingModel = <any>{ name: '@azure/functions', version: '4.0.0' };
                worker.app.isUsingWorkerIndexing = true;
                process.env.FUNCTIONS_NODE_BLOCK_ON_ENTRY_POINT_ERROR = '1';
                await verifyAppStartFails(true);
            });

            it('fails (v3) (app setting=1)', async () => {
                process.env.FUNCTIONS_NODE_BLOCK_ON_ENTRY_POINT_ERROR = '1';
                await verifyAppStartFails(false);
            });
        });

        describe('Node <v20', () => {
            before(function (this: IHookCallbackContext) {
                if (isNode20Plus()) {
                    this.skip();
                }
            });

            it('Logs error for missing entry point file', async () => {
                const fileSubpath = await setTestAppMainField('missing.js');
                const message = `Worker was unable to load entry point "${fileSubpath}": File does not exist`;
                await verifyAppStartSucceedsAndLogsError(false, fileSubpath, message);
            });

            it('Logs error for missing entry point glob pattern', async () => {
                const fileSubpath = await setTestAppMainField('missing/*.js');
                const message = `Worker was unable to load entry point "${fileSubpath}": Found zero files matching the supplied pattern`;
                await verifyAppStartSucceedsAndLogsError(false, fileSubpath, message);
            });

            it('succeeds but still logs error (v3)', async function (this: ITestCallbackContext) {
                await verifyAppStartSucceedsAndLogsError(false);
            });

            it('succeeds but still logs error (v3) (app setting=0)', async function (this: ITestCallbackContext) {
                process.env.FUNCTIONS_NODE_BLOCK_ON_ENTRY_POINT_ERROR = '0';
                await verifyAppStartSucceedsAndLogsError(false);
            });

            it('succeeds but still logs error (v4) (app setting=0)', async () => {
                worker.app.programmingModel = <any>{ name: '@azure/functions', version: '4.0.0' };
                worker.app.isUsingWorkerIndexing = true;

                process.env.FUNCTIONS_NODE_BLOCK_ON_ENTRY_POINT_ERROR = '0';
                await verifyAppStartSucceedsAndLogsError(true);
            });

            it('fails (v4)', async () => {
                worker.app.programmingModel = <any>{ name: '@azure/functions', version: '4.0.0' };
                worker.app.isUsingWorkerIndexing = true;

                await verifyAppStartFails(true);
            });

            it('fails (v4) (app setting=1)', async () => {
                worker.app.programmingModel = <any>{ name: '@azure/functions', version: '4.0.0' };
                worker.app.isUsingWorkerIndexing = true;
                process.env.FUNCTIONS_NODE_BLOCK_ON_ENTRY_POINT_ERROR = '1';

                await verifyAppStartFails(true);
            });

            it('fails (v3) (app setting=1)', async () => {
                process.env.FUNCTIONS_NODE_BLOCK_ON_ENTRY_POINT_ERROR = '1';

                await verifyAppStartFails(false);
            });
        });
    });

    for (const rfpValue of ['1', 'https://url']) {
        it(`Skips warn for long load time if rfp already set to ${rfpValue}`, async () => {
            const fileSubpath = await setTestAppMainField('longLoad.js');

            process.env.WEBSITE_RUN_FROM_PACKAGE = rfpValue;
            stream.addTestMessage(msg.init.request(testAppPath));
            await stream.assertCalledWith(
                msg.init.receivedRequestLog,
                msg.loadingEntryPoint(fileSubpath),
                msg.loadedEntryPoint(fileSubpath),
                msg.init.response
            );
        });
    }

    it('Warns for long load time', async () => {
        const fileSubpath = await setTestAppMainField('longLoad.js');

        stream.addTestMessage(msg.init.request(testAppPath));
        await stream.assertCalledWith(
            msg.init.receivedRequestLog,
            msg.loadingEntryPoint(fileSubpath),
            msg.warningLog(/Loading "longLoad.js" took [0-9]+ms/),
            msg.warningLog(
                'Set "WEBSITE_RUN_FROM_PACKAGE" to "1" to significantly improve load times. Learn more here: https://aka.ms/AAjon54'
            ),
            msg.loadedEntryPoint(fileSubpath),
            msg.init.response
        );
    });

    it('runs app start hooks (non-placeholder scenario)', async () => {
        const fileSubpath = await setTestAppMainField('registerAppStartHook.js');

        stream.addTestMessage(msg.init.request(testAppPath));

        await stream.assertCalledWith(
            msg.init.receivedRequestLog,
            msg.loadingEntryPoint(fileSubpath),
            msg.loadedEntryPoint(fileSubpath),
            msg.executingAppHooksLog(1, 'appStart'),
            msg.executedAppHooksLog('appStart'),
            msg.init.response
        );
    });

    it('allows different appStart hooks to share data', async () => {
        const functionAppDirectory = __dirname;
        let hookData = '';

        coreApi.registerHook('appStart', (context) => {
            context.hookData.hello = 'world';
            hookData += 'start1';
        });

        coreApi.registerHook('appStart', (context) => {
            expect(context.hookData.hello).to.equal('world');
            hookData += 'start2';
        });

        stream.addTestMessage(msg.init.request(functionAppDirectory));

        await stream.assertCalledWith(
            msg.init.receivedRequestLog,
            msg.noPackageJsonWarning,
            msg.executingAppHooksLog(2, 'appStart'),
            msg.executedAppHooksLog('appStart'),
            msg.init.response
        );

        expect(hookData).to.equal('start1start2');
    });

    it('enforces readonly property of hookData and appHookData in appStart contexts', async () => {
        const functionAppDirectory = __dirname;

        coreApi.registerHook('appStart', (context) => {
            expect(() => {
                // @ts-expect-error: setting readonly property
                context.hookData = {
                    hello: 'world',
                };
            }).to.throw(`Cannot assign to read only property 'hookData'`);
            expect(() => {
                // @ts-expect-error: setting readonly property
                context.appHookData = {
                    hello: 'world',
                };
            }).to.throw(`Cannot assign to read only property 'appHookData'`);
        });

        stream.addTestMessage(msg.init.request(functionAppDirectory));

        await stream.assertCalledWith(
            msg.init.receivedRequestLog,
            msg.noPackageJsonWarning,
            msg.executingAppHooksLog(1, 'appStart'),
            msg.executedAppHooksLog('appStart'),
            msg.init.response
        );
    });

    it('correctly sets hostVersion in core API', async () => {
        const functionAppDirectory = __dirname;
        const expectedHostVersion = '2.7.0';
        expect(() => coreApi.hostVersion).to.throw('Cannot access hostVersion before worker init');

        coreApi.registerHook('appStart', () => {
            expect(coreApi.hostVersion).to.equal(expectedHostVersion);
        });

        stream.addTestMessage(msg.init.request(functionAppDirectory, expectedHostVersion));

        await stream.assertCalledWith(
            msg.init.receivedRequestLog,
            msg.noPackageJsonWarning,
            msg.executingAppHooksLog(1, 'appStart'),
            msg.executedAppHooksLog('appStart'),
            msg.init.response
        );
    });
});
