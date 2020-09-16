import { WorkerChannel } from '../src/WorkerChannel';
import { FunctionLoader } from '../src/FunctionLoader';
import { TestEventStream } from './TestEventStream';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import 'mocha';
import { load } from 'grpc';
import { FunctionInfo } from '../src/FunctionInfo';

describe('WorkerChannel', () => {
  let channel: WorkerChannel;
  let stream: TestEventStream;
  let loader: sinon.SinonStubbedInstance<FunctionLoader>;
  let functions;
  const getTriggerDataMock: () => { [k: string]: rpc.ITypedData } =  () => {
    return {
      "Headers": {
        json: JSON.stringify({Connection: 'Keep-Alive'})
      },
      "Sys": {
        json: JSON.stringify({MethodName: 'test-js', UtcNow: '2018', RandGuid: '3212'})
      }
    }
  };
  const httpInputData = {
    name: "req",
    data: {
        data: "http",
        http: 
        {
            body:
            {
                string: "blahh"
            },
            rawBody:
            {
                string: "blahh"
            }
        }
    } 
  };
  const orchestrationTriggerBinding = {
    type: "orchestrationtrigger",
    direction: 1,
    dataType: 1
  };
  const httpInputBinding = { 
    type: "httpTrigger",
    direction: 0,
    dataType: 1
  };
  const httpOutputBinding = {
    type: "http",
    direction: 1,
    dataType: 1
  };
  const queueOutputBinding = {
    type: "queue",
    direction: 1,
    dataType: 1
  };
  const httpReturnBinding = { 
    bindings: { 
      req: httpInputBinding, 
      $return: httpOutputBinding 
    } 
  };
  const httpResBinding = { 
    bindings: { 
      req: httpInputBinding, 
      res: httpOutputBinding 
    } 
  };
  const multipleBinding = { 
    bindings: { 
      req: httpInputBinding, 
      res: httpOutputBinding,
      queueOutput: queueOutputBinding,
      overriddenQueueOutput: queueOutputBinding
    } 
  };
  const orchestratorBinding = {
    bindings: {
      test: orchestrationTriggerBinding
    }
  };

  beforeEach(() => {
    stream = new TestEventStream();
    loader = sinon.createStubInstance<FunctionLoader>(FunctionLoader);
    channel = new WorkerChannel('workerId', stream, loader);
  });

  it('responds to init', () => {
    let initMessage = {
      requestId: 'id',
      workerInitRequest: {
        capabilities: {}
      }
    };

    let expectedOutput = {
      requestId: 'id',
      workerInitResponse: {
        capabilities: { 
              'RpcHttpBodyOnly': 'true',
              'RpcHttpTriggerMetadataRemoved': 'true',
              'IgnoreEmptyValuedRpcHttpHeaders': 'true',
              'UseNullableValueDictionaryForHttp': "true"
        },
        result: {
          status: rpc.StatusResult.Status.Success
        }
      }
    }

    // V1 worker behavior
    if (process.version.startsWith('v8')) {
      initMessage.workerInitRequest.capabilities['V2Compatable'] = 'true';
    // Expect this behavior in V2 worker behavior
    } else {
      expectedOutput.workerInitResponse.capabilities['TypedDataCollection'] = 'true';
    }
    
    stream.addTestMessage(initMessage);
    sinon.assert.calledWith(stream.written, );
  });

  it('does not init for Node.js v8.x and v2 compatability = false', () => {
    let version = process.version;
    if (version.split(".")[0] === "v8") {
      let initMessage = {
        requestId: 'id',
        workerInitRequest: {
          capabilities: {}
        }
      };
          
      expect(() =>
        stream.addTestMessage(initMessage)).to.throw(`Incompatible Node.js version (${process.version}). The version of the Azure Functions runtime you are using (v3) supports Node.js v10.x and v12.x. Refer to our documentation to see the Node.js versions supported by each version of Azure Functions: https://aka.ms/functions-node-versions`
      );
    }
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

  it ('invokes function in V2 compat mode', () => {
    loader.getFunc.returns((context) => context.done());
    loader.getInfo.returns(new FunctionInfo(orchestratorBinding));

    var actualInvocationRequest: rpc.IInvocationRequest = <rpc.IInvocationRequest> {
      functionId: 'id',
      invocationId: '1',
      inputData: [httpInputData],
      triggerMetadata: getTriggerDataMock(),
    };

    stream.addTestMessage({
      workerInitRequest: {
        hostVersion: "3.0.0000",
        capabilities: {
          V2Compatable: "true"
        }
      }
    });

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
    expect(JSON.stringify(actualInvocationRequest.triggerMetadata!.$request)).to.equal(JSON.stringify(httpInputData.data));
    expect(JSON.stringify(actualInvocationRequest.triggerMetadata!.req)).to.equal(JSON.stringify(httpInputData.data));
  });

  it ('invokes function', () => {
    loader.getFunc.returns((context) => context.done());
    loader.getInfo.returns(new FunctionInfo(orchestratorBinding));

    var actualInvocationRequest: rpc.IInvocationRequest = <rpc.IInvocationRequest> {
      functionId: 'id',
      invocationId: '1',
      inputData: [httpInputData],
      triggerMetadata: getTriggerDataMock(),
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

    // triggerMedata will not be augmented with inpuDataValue since we are running Functions Host V3 compatability.
    expect(JSON.stringify(actualInvocationRequest.triggerMetadata!.$request)).to.be.undefined;
    expect(JSON.stringify(actualInvocationRequest.triggerMetadata!.req)).to.be.undefined;
  });

  it ('returns correct data with $return binding', () => {
    let httpResponse;
    loader.getFunc.returns((context) => { httpResponse = context.res; context.done(null, { body: { hello: "world" }})});
    loader.getInfo.returns(new FunctionInfo(httpReturnBinding));

    var actualInvocationRequest: rpc.IInvocationRequest = <rpc.IInvocationRequest> {
      functionId: 'id',
      invocationId: '1',
      inputData: [httpInputData],
      triggerMetadata: getTriggerDataMock(),
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
        outputData: [{
          data: {
            http: httpResponse
          },
          name: "$return"
        }],
        returnValue: { 
          http: {
            body: { json: "{\"hello\":\"world\"}" },
            cookies: [],
            headers: { },
            statusCode: undefined
          }
        }
      }
    });
  });

  it ('returns returned output if not http', () => {
    loader.getFunc.returns((context) => context.done(null, ["hello, seattle!", "hello, tokyo!"]));
    loader.getInfo.returns(new FunctionInfo(orchestratorBinding));

    var actualInvocationRequest: rpc.IInvocationRequest = <rpc.IInvocationRequest> {
      functionId: 'id',
      invocationId: '1',
      inputData: [],
      triggerMetadata: getTriggerDataMock(),
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
        outputData: [],
        returnValue: { 
          json: "[\"hello, seattle!\",\"hello, tokyo!\"]"
        }
      }
    });
  });

  it ('returned output is ignored if http', () => {
    loader.getFunc.returns((context) => context.done(null, ["hello, seattle!", "hello, tokyo!"]));
    loader.getInfo.returns(new FunctionInfo(httpResBinding));

    var actualInvocationRequest: rpc.IInvocationRequest = <rpc.IInvocationRequest> {
      functionId: 'id',
      invocationId: '1',
      inputData: [],
      triggerMetadata: getTriggerDataMock(),
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
        outputData: [],
        returnValue: undefined
      }
    });
  });

  it ('returns string data with $return binding and V2 compat', () => {
    let httpResponse;
    loader.getFunc.returns((context) => { httpResponse = context.res; context.done(null, { body: { hello: "world" }})});
    loader.getInfo.returns(new FunctionInfo(httpReturnBinding));

    stream.addTestMessage({
      workerInitRequest: {
        hostVersion: "3.0.0000",
        capabilities: {
          V2Compatable: "true"
        }
      }
    });

    var actualInvocationRequest: rpc.IInvocationRequest = <rpc.IInvocationRequest> {
      functionId: 'id',
      invocationId: '1',
      inputData: [httpInputData],
      triggerMetadata: getTriggerDataMock(),
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
        outputData: [{
          data: {
            http: httpResponse
          },
          name: "$return"
        }],
        returnValue: { json: "{\"body\":{\"hello\":\"world\"}}" }
      }
    });
  });

  it ('serializes output binding data through context.done', () => {
    loader.getFunc.returns((context) => context.done(null, { res: { body: { hello: "world" }}}));
    loader.getInfo.returns(new FunctionInfo(httpResBinding));

    var actualInvocationRequest: rpc.IInvocationRequest = <rpc.IInvocationRequest> {
      functionId: 'id',
      invocationId: '1',
      inputData: [httpInputData],
      triggerMetadata: getTriggerDataMock(),
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
        outputData: [{
          data: {
            http: {
              body: { json: "{\"hello\":\"world\"}" },
              cookies: [],
              headers: { },
              statusCode: undefined
            }
          },
          name: "res"
        }]
      }
    });
  });

  it ('serializes multiple output bindings through context.done and context.bindings', () => {
    loader.getFunc.returns((context) => {
      context.bindings.queueOutput = "queue message";
      context.bindings.overriddenQueueOutput = "start message";
      context.done(null, { 
        res: { body: { hello: "world" } },
        overriddenQueueOutput: "override"
      });
    });
    loader.getInfo.returns(new FunctionInfo(multipleBinding));

    var actualInvocationRequest: rpc.IInvocationRequest = <rpc.IInvocationRequest> {
      functionId: 'id',
      invocationId: '1',
      inputData: [httpInputData],
      triggerMetadata: getTriggerDataMock(),
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
        outputData: [{
          data: {
            http: {
              body: { json: "{\"hello\":\"world\"}" },
              cookies: [],
              headers: { },
              statusCode: undefined
            }
          },
          name: "res"
        },
        {
          data: {
            string: "override"
          },
          name: "overriddenQueueOutput"
        },
        {
          data: {
            string: "queue message"
          },
          name: "queueOutput"
        }]
      }
    });
  });

  it ('serializes output binding data through context.done with V2 compat', () => {
    loader.getFunc.returns((context) => context.done(null, { res: { body: { hello: "world" }}}));
    loader.getInfo.returns(new FunctionInfo(httpResBinding));

    stream.addTestMessage({
      workerInitRequest: {
        hostVersion: "3.0.0000",
        capabilities: {
          V2Compatable: "true"
        }
      }
    });

    var actualInvocationRequest: rpc.IInvocationRequest = <rpc.IInvocationRequest> {
      functionId: 'id',
      invocationId: '1',
      inputData: [httpInputData],
      triggerMetadata: getTriggerDataMock(),
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
        outputData: [],
        returnValue: {
          json: "{\"res\":{\"body\":{\"hello\":\"world\"}}}"
        }
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