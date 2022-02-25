// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import 'mocha';
import * as sinon from 'sinon';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { FunctionLoader } from '../../src/FunctionLoader';
import { WorkerChannel } from '../../src/WorkerChannel';
import { beforeEventHandlerTest } from './beforeEventHandlerTest';
import { TestEventStream } from './TestEventStream';

describe('functionLoadRequest', () => {
    let stream: TestEventStream;
    let loader: sinon.SinonStubbedInstance<FunctionLoader>;

    beforeEach(() => {
        ({ stream, loader } = beforeEventHandlerTest());
    });

    it('responds to function load', async () => {
        stream.addTestMessage({
            requestId: 'id',
            functionLoadRequest: {
                functionId: 'funcId',
                metadata: {},
            },
        });
        // Set slight delay
        await new Promise((resolve) => setTimeout(resolve, 100));
        sinon.assert.calledWith(stream.written, <rpc.IStreamingMessage>{
            requestId: 'id',
            functionLoadResponse: {
                functionId: 'funcId',
                result: {
                    status: rpc.StatusResult.Status.Success,
                },
            },
        });
    });

    it('handles function load exception', () => {
        const err = new Error('Function throws error');
        err.stack = '<STACKTRACE>';

        loader.load = sinon.stub().throws(err);
        new WorkerChannel('workerId', stream, loader);
        stream.addTestMessage({
            requestId: 'id',
            functionLoadRequest: {
                functionId: 'funcId',
                metadata: {},
            },
        });
        sinon.assert.calledWith(stream.written, <rpc.IStreamingMessage>{
            requestId: 'id',
            functionLoadResponse: {
                functionId: 'funcId',
                result: {
                    status: rpc.StatusResult.Status.Failure,
                    exception: {
                        message: "Worker was unable to load function undefined: 'Function throws error'",
                        stackTrace: '<STACKTRACE>',
                    },
                },
            },
        });
    });
});
