// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { beforeEventHandlerSuite } from './beforeEventHandlerSuite';
import { TestEventStream } from './TestEventStream';
import sinon = require('sinon');
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

namespace Msg {
    export function workerTerminate(gracePeriodSeconds = 5): rpc.IStreamingMessage {
        return {
            workerTerminate: {
                gracePeriod: {
                    seconds: gracePeriodSeconds,
                },
            },
        };
    }

    export const receivedWorkerTerminateLog: rpc.IStreamingMessage = {
        rpcLog: {
            message: 'Received workerTerminate message; gracefully shutting down worker',
            level: LogLevel.Debug,
            logCategory: LogCategory.System,
        },
    };
}

describe('terminateWorker', () => {
    let stream: TestEventStream;
    let processExitStub: sinon.SinonStub;

    before(() => {
        ({ stream } = beforeEventHandlerSuite());
        processExitStub = sinon.stub(process, 'exit');
    });

    after(() => {
        processExitStub.restore();
    });

    it('handles worker_terminate request', async () => {
        stream.addTestMessage(Msg.workerTerminate());
        await stream.assertCalledWith(Msg.receivedWorkerTerminateLog);
        expect(processExitStub.calledWith(0)).to.be.true;
    });

    it('shuts down worker in response to worker_termiante request', async () => {
        stream.addTestMessage(Msg.workerTerminate());
        await stream.assertCalledWith(Msg.receivedWorkerTerminateLog);
        expect(processExitStub.calledWith(0)).to.be.true;
    });
});
