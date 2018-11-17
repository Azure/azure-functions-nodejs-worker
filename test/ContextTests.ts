import { CreateContextAndInputs, ILogCallback, IResultCallback } from '../src/Context';
import { IContext } from "../src/public/Interfaces";
import { FunctionInfo } from '../src/FunctionInfo';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import * as sinon from 'sinon';
import 'mocha';

describe('Context', () => {
    let _context: IContext;
    let _logger: any;
    let _resultCallback: any;

    beforeEach(() => {
        let info: FunctionInfo = new FunctionInfo({ name: 'test' });
        let msg: rpc.IInvocationRequest = {
            functionId: 'id',
            invocationId: '1',
            inputData: []
        };
        _logger = sinon.spy();
        _resultCallback = sinon.spy();

        let { context, inputs } = CreateContextAndInputs(info, msg, _logger, _resultCallback);
        _context = context;
    });

    it ('async function logs error on calling context.done', (done) => {
        var promise = asyncThrowsError(_context)
        .then(result => (<any>_context.done)(null, result, true))
        .catch(err => (<any>_context.done)(err, null, true))

        promise.then(() => {
            sinon.assert.calledOnce(_logger);
            sinon.assert.calledWith(_logger, rpc.RpcLog.Level.Error, "Error: Choose either to return a promise or call 'done'.  Do not use both in your script.");
            done();
        })
        .catch(done);
    });

    it ('async function calls callback and returns value without context.done', (done) => {
        var promise = asyncPlainFunction(_context)
        .then(result => (<any>_context.done)(null, result, true))
        .catch(err => (<any>_context.done)(err, null, true))

        promise.then(() => {
            sinon.assert.calledOnce(_resultCallback);
            sinon.assert.calledWith(_resultCallback, null, { bindings: {  }, return: "hello" });
            done();
        })
        .catch(done);
    });

    it ('function logs error on calling context.done more than once', () => {
        callbackTwice(_context);
        sinon.assert.calledOnce(_logger);
        sinon.assert.calledWith(_logger, rpc.RpcLog.Level.Error, "Error: 'done' has already been called. Please check your script for extraneous calls to 'done'.");
    });

    it ('function calls callback correctly with bindings', () => {
        callbackOnce(_context);
        sinon.assert.calledOnce(_resultCallback);
        sinon.assert.calledWith(_resultCallback, undefined, { bindings: { hello: "world" }, return: undefined });
    });

    it ('empty function does not call callback', () => {
        callbackNone(_context);
        sinon.assert.notCalled(_resultCallback);
    });
})

// async test functions
async function asyncThrowsError(context) {
    context.done();
}

async function asyncPlainFunction(context) { 
    return "hello";
}

// sync test functions
function callbackTwice(context) {
    context.done();
    context.done();
}

function callbackOnce(context) {
    context.bindings = { "hello": "world" };
    context.done();
}

function callbackNone(context) {
}
