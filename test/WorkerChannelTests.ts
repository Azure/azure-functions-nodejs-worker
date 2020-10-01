import { WorkerChannel } from '../src/WorkerChannel';
import { FunctionLoader } from '../src/FunctionLoader';
import { TestEventStream } from './TestEventStream';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import 'mocha';
import { load } from 'grpc';
import { worker } from 'cluster';

describe('WorkerChannel', () => {
  var channel: WorkerChannel;
  var stream: TestEventStream;
  var loader: sinon.SinonStubbedInstance<FunctionLoader>;
  var functions;
  
  const assertInvokedFunction = () => {
    const triggerDataMock: { [k: string]: rpc.ITypedData } = {
      "Headers": {
          json: JSON.stringify({Connection: 'Keep-Alive'})
      },
      "Sys": {
          json: JSON.stringify({MethodName: 'test-js', UtcNow: '2018', RandGuid: '3212'})
        }
    };

    const inputDataValue = {
      name: "req",
      data: {
          data: "http",
          http: 
          {
              body:
              {
                  data: "string",
                  body: "blahh"
              },
              rawBody:
              {
                  data: "string",
                  body: "blahh"
              }
          }
      } 
    };

    const actualInvocationRequest: rpc.IInvocationRequest = <rpc.IInvocationRequest> {
      functionId: 'id',
      invocationId: '1',
      inputData: [inputDataValue],
      triggerMetadata: triggerDataMock,
    };

    stream.addTestMessage({
      invocationRequest: actualInvocationRequest
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

    // triggerMedata will be augmented with inpuDataValue since "RpcHttpTriggerMetadataRemoved" capability is set to true and therefore not populated by the host.
    expect(JSON.stringify(actualInvocationRequest.triggerMetadata!.$request)).to.equal(JSON.stringify(inputDataValue.data));
    expect(JSON.stringify(actualInvocationRequest.triggerMetadata!.req)).to.equal(JSON.stringify(inputDataValue.data));
  }

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
        capabilities: { 
              'RpcHttpBodyOnly': "true",
              'RpcHttpTriggerMetadataRemoved': "true",
              'IgnoreEmptyValuedRpcHttpHeaders': "true",
              'WorkerStatus': "true",
              'UseNullableValueDictionaryForHttp': "true"
        },
        result: {
          status: rpc.StatusResult.Status.Success
        }
      }
    });
  });

  it('responds to function load', () => {
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
  
  it('handles function load exception', () => {
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
    process.env.PlaceholderVariable = "TRUE";
    stream.addTestMessage({
      requestId: 'id',
      functionEnvironmentReloadRequest: {  
        environmentVariables: {
          "hello": "world",
          "SystemDrive": "Q:"
        },
        functionAppDirectory: null
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
    expect(process.env.PlaceholderVariable).to.be.undefined;
  });

  it ('reloading environment variables removes existing environment variables', () => {
    process.env.PlaceholderVariable = "TRUE";
    process.env.NODE_ENV = "Debug";
    stream.addTestMessage({
      requestId: 'id',
      functionEnvironmentReloadRequest: {  
        environmentVariables: {},
        functionAppDirectory: null
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
    expect(process.env).to.be.empty;
  });

  it ('reloads empty environment variables without throwing', () => {
    expect(() => {
      stream.write({
        requestId: 'id',
        functionEnvironmentReloadRequest: {  
          environmentVariables: {},
          functionAppDirectory: null
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
          environmentVariables: null,
          functionAppDirectory: null
        }
      });
    }).to.not.throw();
  });

  it ('reloads environment variable and keeps cwd without functionAppDirectory', () => {
    let cwd = process.cwd();
    stream.addTestMessage({
      requestId: 'id',
      functionEnvironmentReloadRequest: {  
        environmentVariables: {
          "hello": "world",
          "SystemDrive": "Q:"
        },
        functionAppDirectory: null
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
    expect(process.cwd() == cwd);
  });

  it ('reloads environment variable and changes functionAppDirectory', () => {
    let cwd = process.cwd();
    let newDir = "/";
    stream.addTestMessage({
      requestId: 'id',
      functionEnvironmentReloadRequest: {  
        environmentVariables: {
          "hello": "world",
          "SystemDrive": "Q:"
        },
        functionAppDirectory: newDir
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
    expect(process.cwd() != newDir);
    expect(process.cwd() == newDir);
    process.chdir(cwd);
  });

  it ('returns response to worker status request', () => {
    stream.addTestMessage({
      requestId: 'id',
      workerStatusRequest: {}
    });
    sinon.assert.calledWith(stream.written, <rpc.IStreamingMessage>{
      requestId: 'id',
      workerStatusResponse: {}
    });
  });
  
  describe('#invocationRequestBefore, #invocationRequestAfter', () => {
    afterEach(() => {
      delete channel.invocationRequestBefore;
      delete channel.invocationRequestAfter;
    });

    it("should apply hook before user function is executed", () => {
      channel.invocationRequestBefore = (context, userFunction) => {
        context["magic_flag"] = 'magic value';
        return userFunction.bind({__wrapped: true});
      }

      loader.getFunc.returns(function (this: any, context) {
        expect(context['magic_flag']).to.equal('magic value');
        expect(this.__wrapped).to.equal(true);
        context.done();
      });
      loader.getInfo.returns({
        name: 'test',
        outputBindings: {}
      });

      assertInvokedFunction();
    });
    
    it('should apply hook after user function is executed (callback)', (done) => {
      let finished = false;
      channel.invocationRequestAfter = () => {
        expect(finished).to.equal(true);
        done();
      }

      loader.getFunc.returns(function (this: any, context) {
        finished = true;
        context.done();
      });
      loader.getInfo.returns({
        name: 'test',
        outputBindings: {}
      });

      assertInvokedFunction();
    });
    
    it('should apply hook after user function resolves (promise)', (done) => {
      let finished = false;
      channel.invocationRequestAfter = () => {
        expect(finished).to.equal(true);
        done();
      }

      loader.getFunc.returns(new Promise((resolve) => {
        finished = true;
        resolve()
      }));
      loader.getInfo.returns({
        name: 'test',
        outputBindings: {}
      });

      assertInvokedFunction();
    });
    
    
    it('should apply hook after user function rejects (promise)', (done) => {
      let finished = false;
      channel.invocationRequestAfter = () => {
        expect(finished).to.equal(true);
        done();
      }

      loader.getFunc.returns(new Promise((_, reject) => {
        finished = true;
        reject()
      }));
      loader.getInfo.returns({
        name: 'test',
        outputBindings: {}
      });

      assertInvokedFunction();
    });

  });

  it ('invokes function', () => {
    loader.getFunc.returns((context) => context.done());
    loader.getInfo.returns({
      name: 'test',
      outputBindings: {}
    })

    assertInvokedFunction();
  });

  it ('throws for malformed messages', () => {
    expect(() => {
      stream.write(<any>{
        functionLoadResponse: 1
      });
    }).to.throw("functionLoadResponse.object expected");
  });
})