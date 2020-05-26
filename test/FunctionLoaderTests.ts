import { WorkerChannel } from '../src/WorkerChannel';
import { FunctionLoader } from '../src/FunctionLoader';
import { expect } from 'chai';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import 'mocha';
import mock = require('mock-require');

describe('FunctionLoader', () => {
  var channel: WorkerChannel;
  var loader: FunctionLoader;
  var require;
  var functions;
  var context, logs, bindingValues;

  beforeEach(() => {
    loader = new FunctionLoader();
    logs = [];
    bindingValues = {};
    context = {
      _inputs: [],
      bindings: {},
      log: (message) => logs.push(message),
      bind: (val, cb) => {
          bindingValues = val;
          cb && cb(val);
      }
  };
  });

  it ('throws unable to determine function entry point', () => {
    mock('test', {});
     expect(() => {
        loader.load('functionId', <rpc.IRpcFunctionMetadata> {
            scriptFile: 'test'
        })
     }).to.throw("Unable to determine function entry point. If multiple functions are exported, you must indicate the entry point, either by naming it 'run' or 'index', or by naming it explicitly via the 'entryPoint' metadata property.");
  });
  
  it ('does not load proxy function', () => {
    mock('test', {});
    loader.load('functionId', <rpc.IRpcFunctionMetadata> {
        isProxy: true
    });
      
    expect(() => {
      loader.getFunc('functionId');
    }).to.throw("Function code for 'functionId' is not loaded and cannot be invoked.");
  });

  it ('throws unable to determine function entry point with entryPoint name', () => {
    mock('test', { test: {} });
    let entryPoint = 'wrongEntryPoint'
    expect(() => {
        loader.load('functionId', <rpc.IRpcFunctionMetadata> {
            scriptFile: 'test',
            entryPoint: entryPoint
        })
    }).to.throw(`Unable to determine function entry point: ${entryPoint}. If multiple functions are exported, you must indicate the entry point, either by naming it 'run' or 'index', or by naming it explicitly via the 'entryPoint' metadata property.`);
  });

  it ('throws the resolved entry point is not a function', () => {
    mock('test', { test: {} });
    let entryPoint = 'test'
    expect(() => {
        loader.load('functionId', <rpc.IRpcFunctionMetadata> {
            scriptFile: 'test',
            entryPoint: entryPoint
        })
    }).to.throw("The resolved entry point is not a function and cannot be invoked by the functions runtime. Make sure the function has been correctly exported.");
  });

  it ('allows use of \'this\' in loaded user function', () => {
    var FuncObject = /** @class */ (function () {
      function FuncObject(this: any) {
          this.prop = true;
      }
      FuncObject.prototype.index = function (ctx) {
          ctx.bindings.prop = this.test();
          ctx.done();
      };
      FuncObject.prototype.test = function () {
          return this.prop;
      };
      return FuncObject;
    }());

    mock('test', new FuncObject());

    loader.load('functionId', <rpc.IRpcFunctionMetadata> {
        scriptFile: 'test',
        entryPoint: 'test'
    });

    var userFunction = loader.getFunc('functionId');

    userFunction(context, (results) => {
      expect(results).to.eql({ prop: true });
    });
  });
  
  it ('allows to return a promise from async user function', () => {
    mock('test', { test: async () => {} });

    loader.load('functionId', <rpc.IRpcFunctionMetadata> {
        scriptFile: 'test',
        entryPoint: 'test'
    });

    var userFunction = loader.getFunc('functionId');
    var result = userFunction();

    expect(result).to.be.not.an('undefined');
    expect(result.then).to.be.a('function');
  });

  afterEach(() => {
    mock.stopAll()
  });
  
})