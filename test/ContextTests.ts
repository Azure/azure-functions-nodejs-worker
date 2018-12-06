import { CreateContextAndInputs, LogCallback, ResultCallback } from '../src/Context';
import { Context } from "../src/public/Interfaces";
import { FunctionInfo } from '../src/FunctionInfo';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import * as sinon from 'sinon';
import 'mocha';

describe('Context', () => {
    let _context: Context;
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
        var promise = callAsync(BasicAsync.asyncThrowsError, _context);

        promise.then(() => {
            sinon.assert.calledOnce(_logger);
            sinon.assert.calledWith(_logger, rpc.RpcLog.Level.Error, "Error: Choose either to return a promise or call 'done'.  Do not use both in your script.");
            done();
        })
        .catch(done);
    });

    it ('async function calls callback and returns value without context.done', (done) => {
        var promise = callAsync(BasicAsync.asyncPlainFunction, _context);

        promise.then(() => {
            sinon.assert.calledOnce(_resultCallback);
            sinon.assert.calledWith(_resultCallback, null, { bindings: {  }, return: "hello" });
            done();
        })
        .catch(done);
    });

    it ('function logs error on calling context.done more than once', () => {
        BasicCallback.callbackTwice(_context);
        sinon.assert.calledOnce(_logger);
        sinon.assert.calledWith(_logger, rpc.RpcLog.Level.Error, "Error: 'done' has already been called. Please check your script for extraneous calls to 'done'.");
    });

    it ('function logs error on calling context.log after context.done() called', () => {
        BasicCallback.callbackOnce(_context);
        _context.log("");
        sinon.assert.calledTwice(_logger);
        sinon.assert.calledWith(_logger, rpc.RpcLog.Level.Error, "Error: Unexpected call to 'log' after function execution has completed. Please check for asynchronous calls that are not awaited or did not use the 'done' callback where expected.");
    });

    it ('function logs error on calling context.log from non-awaited async call', async () => {
        await callAsync(BasicAsync.asyncPlainFunction, _context);
        _context.log("");
        sinon.assert.calledTwice(_logger);
        sinon.assert.calledWith(_logger, rpc.RpcLog.Level.Error, "Error: Unexpected call to 'log' after function execution has completed. Please check for asynchronous calls that are not awaited or did not use the 'done' callback where expected.");
    });

    it ('function calls callback correctly with bindings', () => {
        BasicCallback.callbackOnce(_context);
        sinon.assert.calledOnce(_resultCallback);
        sinon.assert.calledWith(_resultCallback, undefined, { bindings: { hello: "world" }, return: undefined });
    });

    it ('empty function does not call callback', () => {
        BasicCallback.callbackNone(_context);
        sinon.assert.notCalled(_resultCallback);
    });
})

// async test functions
class BasicAsync {
    public static async asyncThrowsError(context: Context) {
        context.done();
    }

    public static async asyncPlainFunction(context: Context) { 
        return "hello";
    }
}

// sync test functions
class BasicCallback {
    public static callbackTwice(context) {
        context.done();
        context.done();
    }

    public static callbackOnce(context) {
        context.bindings = { "hello": "world" };
        context.done();
    }

    public static callbackNone(context) {
    }
}

// Does what we do with async functions in FunctionLoader
async function callAsync(myFunc, context: Context): Promise<any> {
    return myFunc(context).then(result => (<any>context.done)(null, result, true))
        .catch(err => (<any>context.done)(err, null, true));
}