// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as sinon from 'sinon';
import { LegacyFunctionLoader } from '../../src/LegacyFunctionLoader';
import { setupCoreModule } from '../../src/setupCoreModule';
import { setupEventStream } from '../../src/setupEventStream';
import { WorkerChannel } from '../../src/WorkerChannel';
import { TestEventStream } from './TestEventStream';

let testWorkerData:
    | {
          stream: TestEventStream;
          loader: sinon.SinonStubbedInstance<LegacyFunctionLoader>;
          channel: WorkerChannel;
      }
    | undefined = undefined;

export function beforeEventHandlerSuite() {
    if (!testWorkerData) {
        const stream = new TestEventStream();
        const loader = sinon.createStubInstance<LegacyFunctionLoader>(LegacyFunctionLoader);
        const channel = new WorkerChannel(stream, loader);
        setupEventStream('workerId', channel);
        setupCoreModule(channel);
        testWorkerData = { stream, loader, channel };
        // Clear out logs that happened during setup, so that they don't affect whichever test runs first
        stream.written.resetHistory();
    }
    return testWorkerData;
}
