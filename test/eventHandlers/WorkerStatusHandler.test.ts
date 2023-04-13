// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import 'mocha';
import { WorkerChannel } from '../../src/WorkerChannel';
import { TestEventStream } from './TestEventStream';
import { beforeEventHandlerSuite } from './beforeEventHandlerSuite';

describe('WorkerStatusHandler', () => {
    let stream: TestEventStream;
    let channel: WorkerChannel;

    before(() => {
        ({ stream, channel } = beforeEventHandlerSuite());
    });

    afterEach(async () => {
        await stream.afterEachEventHandlerTest(channel);
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
