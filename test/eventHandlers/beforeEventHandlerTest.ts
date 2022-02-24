// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as sinon from 'sinon';
import { FunctionLoader } from '../../src/FunctionLoader';
import { WorkerChannel } from '../../src/WorkerChannel';
import { TestEventStream } from './TestEventStream';

export function beforeEventHandlerTest() {
    const stream = new TestEventStream();
    const loader = sinon.createStubInstance<FunctionLoader>(FunctionLoader);
    const channel = new WorkerChannel('workerId', stream, loader);
    return { stream, loader, channel };
}
