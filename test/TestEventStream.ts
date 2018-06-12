import { IEventStream } from '../src/GrpcService';
import { EventEmitter } from 'events';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import * as sinon from 'sinon';

export class TestEventStream extends EventEmitter implements IEventStream {
  written: sinon.SinonSpy;
  constructor() {
    super();
    this.written = sinon.spy();
  }
  write(message: rpc.IStreamingMessage) {
    this.written(message);
  }
  end(): void { }

  addTestMessage(msg: rpc.IStreamingMessage) {
    this.emit('data', rpc.StreamingMessage.create(msg));
  }
}