// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import 'mocha';
import * as coreTypes from '@azure/functions-core';
import { expect } from 'chai';
import * as fs from 'fs/promises';
import { logColdStartWarning } from '../../src/eventHandlers/WorkerInitHandler';
import { isNode20Plus } from '../../src/utils/util';
import { worker } from '../../src/WorkerContext';
import { beforeEventHandlerSuite } from './beforeEventHandlerSuite';
import { msg } from './msg';
import { setTestAppMainField, testAppPath, testPackageJsonPath } from './testAppUtils';
import { TestEventStream } from './TestEventStream';

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
        await stream.assertCalledWith(msg.init.receivedRequestLog, msg.init.nodeVersionLog(), msg.init.response);
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
        await stream.assertCalledWith(msg.init.receivedRequestLog, msg.init.nodeVersionLog(), msg.init.response);
        expect(worker.app.packageJson).to.deep.equal(expectedPackageJson);
    });

    it('loads empty package.json', async () => {
        stream.addTestMessage(msg.init.request('folderWithoutPackageJson'));
        await stream.assertCalledWith(
            msg.init.receivedRequestLog,
            msg.noPackageJsonWarning,
            msg.init.nodeVersionLog(),
            msg.init.response
        );
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
            msg.init.nodeVersionLog(),
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
                msg.init.nodeVersionLog(),
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
            msg.init.nodeVersionLog(),
            msg.init.response
        );
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
                msg.init.nodeVersionLog(),
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
            msg.init.nodeVersionLog(),
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
            msg.init.nodeVersionLog(),
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
            msg.init.nodeVersionLog(),
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
            msg.init.nodeVersionLog(),
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
            msg.init.nodeVersionLog(),
            msg.init.response
        );
    });
});
