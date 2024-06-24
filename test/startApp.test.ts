// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { IHookCallbackContext, ITestCallbackContext } from 'mocha';
import { isNode20Plus } from '../src/utils/util';
import { worker } from '../src/WorkerContext';
import { beforeEventHandlerSuite } from './eventHandlers/beforeEventHandlerSuite';
import { msg } from './eventHandlers/msg';
import { setTestAppMainField, testAppPath } from './eventHandlers/testAppUtils';
import { TestEventStream } from './eventHandlers/TestEventStream';

describe('startApp', () => {
    let stream: TestEventStream;

    before(async () => {
        stream = beforeEventHandlerSuite();
    });

    afterEach(async () => {
        await stream.afterEachEventHandlerTest();
    });

    async function verifyAppStartSucceedsAndLogsError(
        isModelV4: boolean,
        fileSubpath?: string,
        errorMessage?: string
    ): Promise<void> {
        fileSubpath ||= await setTestAppMainField('throwError.js');
        errorMessage ||= `Worker was unable to load entry point "${fileSubpath}": test`;

        stream.addTestMessage(msg.init.request(testAppPath));
        if (fileSubpath.includes('missing')) {
            await stream.assertCalledWith(msg.init.receivedRequestLog, msg.errorLog(errorMessage), msg.init.response);
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

    async function verifyAppStartFails(isModelV4: boolean, fileSubpath?: string, errorMessage?: string): Promise<void> {
        fileSubpath ||= await setTestAppMainField('throwError.js');
        errorMessage ||= `Worker was unable to load entry point "${fileSubpath}": test`;

        stream.addTestMessage(msg.init.request(testAppPath));
        if (fileSubpath.includes('missing')) {
            await stream.assertCalledWith(msg.init.receivedRequestLog, msg.errorLog(errorMessage), msg.init.response);
        } else {
            await stream.assertCalledWith(
                msg.init.receivedRequestLog,
                msg.loadingEntryPoint(fileSubpath),
                msg.errorLog(errorMessage),
                msg.init.response
            );
        }

        stream.addTestMessage(msg.indexing.request);
        if (isModelV4) {
            await stream.assertCalledWith(
                msg.indexing.receivedRequestLog,
                msg.indexing.failedResponse(errorMessage, false)
            );
        } else {
            await stream.assertCalledWith(msg.indexing.receivedRequestLog, msg.indexing.response([], true));
        }

        stream.addTestMessage(msg.funcLoad.request('helloWorld.js'));
        await stream.assertCalledWith(msg.funcLoad.receivedRequestLog, msg.funcLoad.failedResponse(errorMessage));
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

        it('fails (v3) (app setting=1)', async () => {
            process.env.FUNCTIONS_NODE_BLOCK_ON_ENTRY_POINT_ERROR = '1';
            await verifyAppStartFails(false);
        });

        it('fails (v4)', async () => {
            worker.app.programmingModel = <any>{ name: '@azure/functions', version: '4.0.0' };
            worker.app.isUsingWorkerIndexing = true;
            await verifyAppStartFails(true);
        });

        it('fails (v4) (app setting=0)', async () => {
            worker.app.programmingModel = <any>{ name: '@azure/functions', version: '4.0.0' };
            worker.app.isUsingWorkerIndexing = true;
            process.env.FUNCTIONS_NODE_BLOCK_ON_ENTRY_POINT_ERROR = '0';
            await verifyAppStartFails(true);
        });

        it('fails (v4) (app setting=1)', async () => {
            worker.app.programmingModel = <any>{ name: '@azure/functions', version: '4.0.0' };
            worker.app.isUsingWorkerIndexing = true;
            process.env.FUNCTIONS_NODE_BLOCK_ON_ENTRY_POINT_ERROR = '1';
            await verifyAppStartFails(true);
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

        it('fails (v3) (app setting=1)', async () => {
            process.env.FUNCTIONS_NODE_BLOCK_ON_ENTRY_POINT_ERROR = '1';

            await verifyAppStartFails(false);
        });

        it('fails (v4)', async () => {
            worker.app.programmingModel = <any>{ name: '@azure/functions', version: '4.0.0' };
            worker.app.isUsingWorkerIndexing = true;

            await verifyAppStartFails(true);
        });

        it('succeeds but still logs error (v4) (app setting=0)', async () => {
            worker.app.programmingModel = <any>{ name: '@azure/functions', version: '4.0.0' };
            worker.app.isUsingWorkerIndexing = true;

            process.env.FUNCTIONS_NODE_BLOCK_ON_ENTRY_POINT_ERROR = '0';
            await verifyAppStartSucceedsAndLogsError(true);
        });

        it('fails (v4) (app setting=1)', async () => {
            worker.app.programmingModel = <any>{ name: '@azure/functions', version: '4.0.0' };
            worker.app.isUsingWorkerIndexing = true;
            process.env.FUNCTIONS_NODE_BLOCK_ON_ENTRY_POINT_ERROR = '1';

            await verifyAppStartFails(true);
        });
    });
});
