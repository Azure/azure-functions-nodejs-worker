// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as coreTypes from '@azure/functions-core';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { worker } from '../../src/WorkerContext';
import { beforeEventHandlerSuite } from './beforeEventHandlerSuite';
import { msg } from './msg';
import { TestEventStream } from './TestEventStream';

describe('terminateWorker', () => {
    let stream: TestEventStream;
    let processExitStub: sinon.SinonStub;
    let streamEndStub: sinon.SinonStub;
    let coreApi: typeof coreTypes;

    before(async () => {
        stream = beforeEventHandlerSuite();
        processExitStub = sinon.stub(process, 'exit');
        streamEndStub = sinon.stub(worker.eventStream, 'end');
        coreApi = await import('@azure/functions-core');
    });

    afterEach(async () => {
        processExitStub.resetHistory();
        streamEndStub.resetHistory();
        await stream.afterEachEventHandlerTest();
    });

    after(() => {
        processExitStub.restore();
    });

    it('handles worker_terminate request', async () => {
        stream.addTestMessage(msg.terminate.request());
        await stream.assertCalledWith(msg.terminate.receivedWorkerTerminateLog);
    });

    it('ends event stream', async () => {
        stream.addTestMessage(msg.terminate.request());
        await stream.assertCalledWith(msg.terminate.receivedWorkerTerminateLog);
        expect(streamEndStub.callCount).to.be.equal(1);
    });

    it('shuts down worker process', async () => {
        stream.addTestMessage(msg.terminate.request());
        await stream.assertCalledWith(msg.terminate.receivedWorkerTerminateLog);
        expect(processExitStub.calledWith(0)).to.be.true;
    });

    it('runs app terminate hooks', async () => {
        const expectedContext: coreTypes.AppTerminateContext = {
            hookData: {},
            appHookData: {},
        };
        const hookFunc = sinon.spy();
        coreApi.registerHook('appTerminate', hookFunc);

        stream.addTestMessage(msg.terminate.request());
        await stream.assertCalledWith(
            msg.terminate.receivedWorkerTerminateLog,
            msg.executingAppHooksLog(1, 'appTerminate'),
            msg.executedAppHooksLog('appTerminate')
        );
        expect(hookFunc.callCount).to.be.equal(1);
        expect(hookFunc.args[0][0]).to.deep.equal(expectedContext);
    });

    it('allows app terminate hooks to share data', async () => {
        let hookData = '';
        coreApi.registerHook('appTerminate', (context) => {
            context.hookData.hello = 'world';
            context.appHookData.foo = 'bar';
            hookData += 'term1';
        });
        coreApi.registerHook('appTerminate', (context) => {
            expect(context.hookData.hello).to.equal('world');
            expect(context.appHookData.foo).to.equal('bar');
            hookData += 'term2';
        });

        stream.addTestMessage(msg.terminate.request());
        await stream.assertCalledWith(
            msg.terminate.receivedWorkerTerminateLog,
            msg.executingAppHooksLog(2, 'appTerminate'),
            msg.executedAppHooksLog('appTerminate')
        );
        expect(hookData).to.equal('term1term2');
    });

    it('allows app start and app terminate hooks to share data', async () => {
        let hookData = '';
        coreApi.registerHook('appStart', (context) => {
            context.hookData.hello = 'world';
            context.appHookData.foo = 'bar';
            hookData += 'start';
        });
        coreApi.registerHook('appTerminate', (context) => {
            expect(context.hookData.hello).to.equal('world');
            expect(context.appHookData.foo).to.equal('bar');
            hookData += 'term';
        });

        stream.addTestMessage(msg.init.request());
        await stream.assertCalledWith(
            msg.init.receivedRequestLog,
            msg.noPackageJsonWarning,
            msg.executingAppHooksLog(1, 'appStart'),
            msg.executedAppHooksLog('appStart'),
            msg.init.response
        );

        stream.addTestMessage(msg.terminate.request());
        await stream.assertCalledWith(
            msg.terminate.receivedWorkerTerminateLog,
            msg.executingAppHooksLog(1, 'appTerminate'),
            msg.executedAppHooksLog('appTerminate')
        );

        expect(hookData).to.equal('startterm');
    });

    it('enforces readonly property of hookData and appHookData in hook contexts', async () => {
        coreApi.registerHook('appTerminate', (context) => {
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

        stream.addTestMessage(msg.terminate.request());

        await stream.assertCalledWith(
            msg.terminate.receivedWorkerTerminateLog,
            msg.executingAppHooksLog(1, 'appTerminate'),
            msg.executedAppHooksLog('appTerminate')
        );
    });
});
