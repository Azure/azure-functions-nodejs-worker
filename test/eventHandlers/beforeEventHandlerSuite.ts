// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { WorkerChannel } from '../../src/WorkerChannel';
import { setupCoreModule } from '../../src/setupCoreModule';
import { setupEventStream } from '../../src/setupEventStream';
import { TestEventStream } from './TestEventStream';

let testWorkerData:
    | {
          stream: TestEventStream;
          channel: WorkerChannel;
      }
    | undefined = undefined;

export function beforeEventHandlerSuite() {
    if (!testWorkerData) {
        const stream = new TestEventStream();
        const channel = new WorkerChannel('00000000-0000-0000-0000-000000000000', stream);
        setupEventStream(channel);
        setupCoreModule(channel);
        testWorkerData = { stream, channel };
        // Clear out logs that happened during setup, so that they don't affect whichever test runs first
        stream.written.resetHistory();
    }
    return testWorkerData;
}
