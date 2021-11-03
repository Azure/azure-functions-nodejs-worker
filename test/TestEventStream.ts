// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { EventEmitter } from 'events';
import * as sinon from 'sinon';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { IEventStream } from '../src/GrpcService';

export class TestEventStream extends EventEmitter implements IEventStream {
    written: sinon.SinonSpy;
    constructor() {
        super();
        this.written = sinon.spy();
    }
    write(message: rpc.IStreamingMessage) {
        this.written(message);
    }
    end(): void {}

    addTestMessage(msg: rpc.IStreamingMessage) {
        this.emit('data', rpc.StreamingMessage.create(msg));
    }
}
