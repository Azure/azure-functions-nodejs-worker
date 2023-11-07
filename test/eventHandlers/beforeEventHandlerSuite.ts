// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { setupCoreModule } from '../../src/setupCoreModule';
import { setupEventStream } from '../../src/setupEventStream';
import { worker } from '../../src/WorkerContext';
import { TestEventStream } from './TestEventStream';

let testEventStream: TestEventStream | undefined;

export function beforeEventHandlerSuite() {
    if (!testEventStream) {
        worker.id = '00000000-0000-0000-0000-000000000000';
        testEventStream = new TestEventStream();
        worker.eventStream = testEventStream;
        setupEventStream();
        setupCoreModule();
        // Clear out logs that happened during setup, so that they don't affect whichever test runs first
        testEventStream.written.resetHistory();
    }
    return testEventStream;
}
