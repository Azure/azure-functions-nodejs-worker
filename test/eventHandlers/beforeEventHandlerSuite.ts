// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as sinon from 'sinon';
import { FunctionLoader } from '../../src/FunctionLoader';
import { setupEventStream } from '../../src/setupEventStream';
import { TestEventStream } from './TestEventStream';

export function beforeEventHandlerSuite() {
    const stream = new TestEventStream();
    const loader = sinon.createStubInstance<FunctionLoader>(FunctionLoader);
    const channel = setupEventStream('workerId', stream, loader);
    return { stream, loader, channel };
}
