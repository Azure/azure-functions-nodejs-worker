import { IEventStream } from '../src/GrpcService';
import { EventEmitter } from 'events';
import { FunctionRpc as rpc } from '../protos/rpc';
import * as sinon from 'sinon';

export class TestEventStream extends EventEmitter implements IEventStream {
  written: sinon.SinonSpy;
  constructor() {
    super();
    this.written = sinon.spy();
  }
  write(message: rpc.StreamingMessage$Properties) {
    this.written(message);
  }
  end(): void { }

  addTestMessage(msg: rpc.StreamingMessage$Properties) {
    this.emit('data', rpc.StreamingMessage.create(msg));
  }
}