// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import 'mocha';
import { LegacyFunctionLoader } from '../../src/LegacyFunctionLoader';
import { WorkerChannel } from '../../src/WorkerChannel';
import { nonNullValue } from '../../src/utils/nonNull';
import { TestEventStream } from './TestEventStream';
import { beforeEventHandlerSuite } from './beforeEventHandlerSuite';
import { msg } from './msg';

describe('FunctionLoadHandler', () => {
    let stream: TestEventStream;
    let channel: WorkerChannel;
    let loader: LegacyFunctionLoader;

    before(() => {
        ({ stream, channel, loader } = beforeEventHandlerSuite());
    });

    afterEach(async () => {
        await stream.afterEachEventHandlerTest(channel);
    });

    it('responds to function load', async () => {
        stream.addTestMessage(msg.funcLoad.request('helloWorld.js'));
        await stream.assertCalledWith(msg.funcLoad.receivedRequestLog, msg.funcLoad.response);
        expect(Object.keys(loader.loadedFunctions).length).to.equal(1);
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

        expect(Object.keys(loader.loadedFunctions).length).to.equal(0);
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

        const userFunction = nonNullValue(loader.getFunction('testFuncId')).callback;
        Object.assign(userFunction, { hello: 'world' });

        const userFunction2 = nonNullValue(loader.getFunction('testFuncId')).callback;

        expect(userFunction).to.not.equal(userFunction2);
        expect(userFunction['hello']).to.equal('world');
        expect(userFunction2['hello']).to.be.undefined;
    });
});
