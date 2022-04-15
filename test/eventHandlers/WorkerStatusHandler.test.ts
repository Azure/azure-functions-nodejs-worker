// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import 'mocha';
import { beforeEventHandlerSuite } from './beforeEventHandlerSuite';
import { TestEventStream } from './TestEventStream';

describe('WorkerStatusHandler', () => {
    let stream: TestEventStream;

    before(() => {
        ({ stream } = beforeEventHandlerSuite());
    });

    afterEach(async () => {
        await stream.afterEachEventHandlerTest();
    });

    it('responds to worker status', async () => {
        stream.addTestMessage({
            requestId: 'id',
            workerStatusRequest: {},
        });
        await stream.assertCalledWith({
            requestId: 'id',
            workerStatusResponse: {},
        });
    });
});
