// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as sinon from 'sinon';
import { FunctionLoader } from '../../src/FunctionLoader';
import { setupCoreModule } from '../../src/setupCoreModule';
import { setupEventStream } from '../../src/setupEventStream';
import { WorkerChannel } from '../../src/WorkerChannel';
import { TestEventStream } from './TestEventStream';

let testWorkerData:
    | {
          stream: TestEventStream;
          loader: sinon.SinonStubbedInstance<FunctionLoader>;
          channel: WorkerChannel;
      }
    | undefined = undefined;

export function beforeEventHandlerSuite(hostVersion = '2.7.0') {
    if (!testWorkerData) {
        const stream = new TestEventStream();
        const loader = sinon.createStubInstance<FunctionLoader>(FunctionLoader);
        const channel = new WorkerChannel(stream, loader);
        channel._hostVersion = hostVersion;
        setupEventStream('workerId', channel);
        setupCoreModule(channel);
        testWorkerData = { stream, loader, channel };
        // Clear out logs that happened during setup, so that they don't affect whichever test runs first
        stream.written.resetHistory();
    }
    return testWorkerData;
}
