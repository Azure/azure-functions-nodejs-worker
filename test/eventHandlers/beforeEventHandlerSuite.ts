// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as sinon from 'sinon';
import { FunctionLoader } from '../../src/FunctionLoader';
import { setupEventStream } from '../../src/setupEventStream';
import { setupWorkerModule } from '../../src/setupWorkerModule';
import { WorkerChannel } from '../../src/WorkerChannel';
import { TestEventStream } from './TestEventStream';

export function beforeEventHandlerSuite() {
    const stream = new TestEventStream();
    const loader = sinon.createStubInstance<FunctionLoader>(FunctionLoader);
    const channel = new WorkerChannel(stream, loader);
    setupEventStream('workerId', channel);
    setupWorkerModule(channel);
    return { stream, loader, channel };
}
