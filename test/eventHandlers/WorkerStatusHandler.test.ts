// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import 'mocha';
import { TestEventStream } from './TestEventStream';
import { beforeEventHandlerSuite } from './beforeEventHandlerSuite';

describe('WorkerStatusHandler', () => {
    let stream: TestEventStream;

    before(() => {
        stream = beforeEventHandlerSuite();
    });

    afterEach(async () => {
        await stream.afterEachEventHandlerTest();
    });

    it('responds to worker status', async () => {
        stream.addTestMessage({
            requestId: 'testReqId',
            workerStatusRequest: {},
        });
        await stream.assertCalledWith({
            requestId: 'testReqId',
            workerStatusResponse: {},
        });
    });
});
