// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import 'mocha';
import * as sinon from 'sinon';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { beforeEventHandlerTest } from './beforeEventHandlerTest';
import { TestEventStream } from './TestEventStream';

describe('workerStatusRequest', () => {
    let stream: TestEventStream;

    beforeEach(() => {
        ({ stream } = beforeEventHandlerTest());
    });

    it('responds to worker status', async () => {
        stream.addTestMessage({
            requestId: 'id',
            workerStatusRequest: {},
        });
        // Set slight delay
        await new Promise((resolve) => setTimeout(resolve, 100));
        sinon.assert.calledWith(stream.written, <rpc.IStreamingMessage>{
            requestId: 'id',
            workerStatusResponse: {},
        });
    });
});
