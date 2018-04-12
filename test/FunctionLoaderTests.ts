import { WorkerChannel } from '../src/WorkerChannel';
import { FunctionLoader } from '../src/FunctionLoader';
import { TestEventStream } from './TestEventStream';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { FunctionRpc as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import 'mocha';
import mock = require('mock-require');

describe('FunctionLoader', () => {
  var channel: WorkerChannel;
  var loader: FunctionLoader;
  var require;
  var functions;

  beforeEach(() => {
    loader = new FunctionLoader();
  });

  it ('throws unable to determine function entry point', () => {
    mock('test', {});
     expect(() => {
        loader.load('functionId', <rpc.RpcFunctionMetadata$Properties> {
            scriptFile: 'test'
        })
     }).to.throw("Unable to determine function entry point. If multiple functions are exported, you must indicate the entry point, either by naming it 'run' or 'index', or by naming it explicitly via the 'entryPoint' metadata property.");
  });
  
  it ('throws unable to determine function entry point with entryPoint name', () => {
    mock('test', { test: {} });
    let entryPoint = 'wrongEntryPoint'
    expect(() => {
        loader.load('functionId', <rpc.RpcFunctionMetadata$Properties> {
            scriptFile: 'test',
            entryPoint: entryPoint
        })
    }).to.throw(`Unable to determine function entry point: ${entryPoint}. If multiple functions are exported, you must indicate the entry point, either by naming it 'run' or 'index', or by naming it explicitly via the 'entryPoint' metadata property.`);
  });
  
  it ('throws the resolved entry point is not a function', () => {
    mock('test', { test: {} });
    let entryPoint = 'test'
    expect(() => {
        loader.load('functionId', <rpc.RpcFunctionMetadata$Properties> {
            scriptFile: 'test',
            entryPoint: entryPoint
        })
    }).to.throw("The resolved entry point is not a function and cannot be invoked by the functions runtime. Make sure the function has been correctly exported.");
  });
  
  afterEach(() => {
    mock.stopAll()
  });
  
})