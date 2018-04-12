import { WorkerChannel } from '../src/WorkerChannel';
import { FunctionLoader } from '../src/FunctionLoader';
import { TestEventStream } from './TestEventStream';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { FunctionRpc as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import 'mocha';

describe('WorkerChannel', () => {
  var channel: WorkerChannel;
  var stream: TestEventStream;
  var loader: sinon.SinonStubbedInstance<FunctionLoader>;
  var functions;

  beforeEach(() => {
    stream = new TestEventStream();
    loader = sinon.createStubInstance<FunctionLoader>(FunctionLoader);
    channel = new WorkerChannel('workerId', stream, loader);
  });

  it('responds to init', () => {
    stream.addTestMessage({
      requestId: 'id',
      workerInitRequest: {  }
    });
    sinon.assert.calledWith(stream.written, <rpc.StreamingMessage$Properties>{
      requestId: 'id',
      workerInitResponse: {
        result: {
          status: rpc.StatusResult.Status.Success
        }
      }
    });
  });

  it('responds to load', () => {
    stream.addTestMessage({
      requestId: 'id',
      functionLoadRequest: {  
        functionId: 'funcId',
        metadata: { }
      }
    });
    sinon.assert.calledWith(stream.written, <rpc.StreamingMessage$Properties>{
      requestId: 'id',
      functionLoadResponse: {
        functionId: 'funcId',
        result: {
          status: rpc.StatusResult.Status.Success
        }
      }
    });
  });

  it ('invokes function', () => {
    loader.getFunc.returns((context) => context.done());
    loader.getInfo.returns({
      name: 'test',
      outputBindings: {}
    })

    stream.addTestMessage({
      invocationRequest: {
        functionId: 'id',
        invocationId: '1',
        inputData: []
      }
    });

    sinon.assert.calledWithMatch(stream.written, <rpc.StreamingMessage$Properties> {
      invocationResponse: {
        invocationId: '1',
        result:  {
          status: rpc.StatusResult.Status.Success
        },
        outputData: []
      }
    });
  });

  it ('throws for malformed messages', () => {
    expect(() => {
      stream.write(<any>{
        functionLoadResponse: 1
      });
    }).to.throw("functionLoadResponse.object expected");
  });
})