// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import 'mocha';
import { expect } from 'chai';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { getLegacyFunction } from '../../src/LegacyFunctionLoader';
import { delay } from '../../src/utils/delay';
import { nonNullValue } from '../../src/utils/nonNull';
import { worker } from '../../src/WorkerContext';
import { beforeEventHandlerSuite } from './beforeEventHandlerSuite';
import { msg } from './msg';
import { tempFile, testAppSrcPath } from './testAppUtils';
import { RegExpStreamingMessage, TestEventStream } from './TestEventStream';

describe('FunctionLoadHandler', () => {
    let stream: TestEventStream;

    before(() => {
        stream = beforeEventHandlerSuite();
    });

    afterEach(async () => {
        await stream.afterEachEventHandlerTest();
    });

    it('responds to function load', async () => {
        stream.addTestMessage(msg.funcLoad.request('helloWorld.js'));
        await stream.assertCalledWith(msg.funcLoad.receivedRequestLog, msg.funcLoad.response);
        expect(Object.keys(worker.app.legacyFunctions).length).to.equal(1);
    });

    it('handles function load exception', async () => {
        stream.addTestMessage(msg.funcLoad.request('throwError.js'));

        const message = "Worker was unable to load function testFuncName: 'test'";

        await stream.assertCalledWith(
            msg.funcLoad.receivedRequestLog,
            msg.errorLog(message),
            msg.funcLoad.failedResponse(message)
        );
    });

    it('handles transient lstat function load exception', async function (this: Mocha.ITestCallbackContext): Promise<void> {
        // https://github.com/Azure/azure-functions-nodejs-worker/issues/693

        this.timeout(15 * 1000);

        await fs.writeFile(
            path.join(testAppSrcPath, tempFile),
            `if (Date.now() < ${Date.now() + 5 * 1000}) 
            { 
                throw new Error("UNKNOWN: unknown error, lstat 'D:\\\\home'"); 
            } else {
                module.exports = async () => { }
            }`
        );

        stream.addTestMessage(msg.funcLoad.request(tempFile));

        const errorMessage = "UNKNOWN: unknown error, lstat 'D:\\home'";
        const msgs: (rpc.IStreamingMessage | RegExpStreamingMessage)[] = [
            msg.funcLoad.receivedRequestLog,
            msg.warningLog(`Warning: Failed to load file with error "${errorMessage}"`),
        ];
        for (let i = 2; i <= 5; i++) {
            msgs.push(msg.debugLog(`Retrying file load. Attempt ${i}/10`));
        }
        msgs.push(msg.funcLoad.response);

        await delay(8 * 1000);

        await stream.assertCalledWith(...msgs);
    });

    it('throws unable to determine function entry point', async () => {
        stream.addTestMessage(msg.funcLoad.request('doNothing.js'));

        const message =
            "Worker was unable to load function testFuncName: 'Unable to determine function entry point. If multiple functions are exported, you must indicate the entry point, either by naming it 'run' or 'index', or by naming it explicitly via the 'entryPoint' metadata property.'";

        await stream.assertCalledWith(
            msg.funcLoad.receivedRequestLog,
            msg.errorLog(message),
            msg.funcLoad.failedResponse(message)
        );
    });

    it('throws unable to determine function entry point with entryPoint name', async () => {
        stream.addTestMessage(msg.funcLoad.request('doNothing.js', { entryPoint: 'wrongEntryPoint' }));

        const message =
            "Worker was unable to load function testFuncName: 'Unable to determine function entry point: wrongEntryPoint. If multiple functions are exported, you must indicate the entry point, either by naming it 'run' or 'index', or by naming it explicitly via the 'entryPoint' metadata property.'";

        await stream.assertCalledWith(
            msg.funcLoad.receivedRequestLog,
            msg.errorLog(message),
            msg.funcLoad.failedResponse(message)
        );
    });

    it('does not load proxy function', async () => {
        stream.addTestMessage(msg.funcLoad.request('doNothing.js', { isProxy: true }));

        await stream.assertCalledWith(msg.funcLoad.receivedRequestLog, msg.funcLoad.response);

        expect(Object.keys(worker.app.legacyFunctions).length).to.equal(0);
    });

    it('throws the resolved entry point is not a function', async () => {
        stream.addTestMessage(msg.funcLoad.request('moduleNotAFunction.js', { entryPoint: 'test' }));

        const message =
            "Worker was unable to load function testFuncName: 'The resolved entry point is not a function and cannot be invoked by the functions runtime. Make sure the function has been correctly exported.'";

        await stream.assertCalledWith(
            msg.funcLoad.receivedRequestLog,
            msg.errorLog(message),
            msg.funcLoad.failedResponse(message)
        );
    });

    it("function returned is a clone so that it can't affect other executions", async () => {
        stream.addTestMessage(msg.funcLoad.request('helloWorld.js'));

        await stream.assertCalledWith(msg.funcLoad.receivedRequestLog, msg.funcLoad.response);

        const userFunction = nonNullValue(getLegacyFunction('testFuncId')).callback;
        Object.assign(userFunction, { hello: 'world' });

        const userFunction2 = nonNullValue(getLegacyFunction('testFuncId')).callback;

        expect(userFunction).to.not.equal(userFunction2);
        expect(userFunction['hello']).to.equal('world');
        expect(userFunction2['hello']).to.be.undefined;
    });
});
