import { WorkerChannel } from '../src/WorkerChannel';
import { FunctionLoader } from '../src/FunctionLoader';
import { TestEventStream } from './TestEventStream';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import 'mocha';
import { load } from 'grpc';

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
    sinon.assert.calledWith(stream.written, <rpc.IStreamingMessage>{
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
    sinon.assert.calledWith(stream.written, <rpc.IStreamingMessage>{
      requestId: 'id',
      functionLoadResponse: {
        functionId: 'funcId',
        result: {
          status: rpc.StatusResult.Status.Success
        }
      }
    });
  });
  
  it('Handles load exception', () => {
    var err = new Error("Function throws error");
    err.stack = "<STACKTRACE>"

    loader.load = sinon.stub().throws(err);
    channel = new WorkerChannel('workerId', stream, loader);
    stream.addTestMessage({
      requestId: 'id',
      functionLoadRequest: {  
        functionId: 'funcId',
        metadata: { }
      }
    });
    sinon.assert.calledWith(stream.written, <rpc.IStreamingMessage>{
      requestId: 'id',
      functionLoadResponse: {
        functionId: 'funcId',
        result: {
          status: rpc.StatusResult.Status.Failure,
          exception: {
            message: "Worker was unable to load function undefined: 'Error: Function throws error'",
            stackTrace: "<STACKTRACE>"
          }
        }
      }
    });
  });
  
  it ('reloads environment variables', () => {
    stream.addTestMessage({
      requestId: 'id',
      functionEnvironmentReloadRequest: {  
        environmentVariables: {
          "hello": "world",
          "SystemDrive": "Q:"
        }
      }
    });
    sinon.assert.calledWith(stream.written, <rpc.IStreamingMessage>{
      requestId: 'id',
      functionEnvironmentReloadResponse: {
        result: {
          status: rpc.StatusResult.Status.Success
        }
      }
    });
    expect(process.env.hello).to.equal("world");
    expect(process.env.SystemDrive).to.equal("Q:");
  });

  it ('reloads environment variables without throwing on empty input', () => {
    expect(() => {
      stream.write({
        requestId: 'id',
        functionEnvironmentReloadRequest: {  
          environmentVariables: {}
        }
      });
    }).to.not.throw();

    expect(() => {
      stream.write({
        requestId: 'id',
        functionEnvironmentReloadRequest: null
      });
    }).to.not.throw();

    expect(() => {
      stream.write({
        requestId: 'id',
        functionEnvironmentReloadRequest: {
          environmentVariables: null
        }
      });
    }).to.not.throw();
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

    sinon.assert.calledWithMatch(stream.written, <rpc.IStreamingMessage> {
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