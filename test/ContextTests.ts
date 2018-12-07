import { CreateContextAndInputs, LogCallback, ResultCallback } from '../src/Context';
import { Context } from "../src/public/Interfaces";
import { FunctionInfo } from '../src/FunctionInfo';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import * as sinon from 'sinon';
import 'mocha';
import { isFunction } from 'util';

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

    it ('async function logs error on calling context.done', async () => {
        await callUserFunc(BasicAsync.asyncThrowsError, _context);
        sinon.assert.calledOnce(_logger);
        sinon.assert.calledWith(_logger, rpc.RpcLog.Level.Error, "Error: Choose either to return a promise or call 'done'.  Do not use both in your script.");
    });

    it ('async function calls callback and returns value without context.done', async () => {
        await callUserFunc(BasicAsync.asyncPlainFunction, _context);
        sinon.assert.calledOnce(_resultCallback);
        sinon.assert.calledWith(_resultCallback, null, { bindings: {  }, return: "hello" });
    });

    it ('function logs error on calling context.done more than once', () => {
        callUserFunc(BasicCallback.callbackTwice, _context);
        sinon.assert.calledOnce(_logger);
        sinon.assert.calledWith(_logger, rpc.RpcLog.Level.Error, "Error: 'done' has already been called. Please check your script for extraneous calls to 'done'.");
    });

    it ('function logs error on calling context.log after context.done() called', () => {
        callUserFunc(BasicCallback.callbackOnce, _context);
        _context.log("");
        sinon.assert.calledTwice(_logger);
        sinon.assert.calledWith(_logger, rpc.RpcLog.Level.Error, "Error: Unexpected call to 'log' after function execution has completed. Please check for asynchronous calls that are not awaited or did not use the 'done' callback where expected.");
    });

    it ('function logs error on calling context.log from non-awaited async call', async () => {
        await callUserFunc(BasicAsync.asyncPlainFunction, _context);
        _context.log("");
        sinon.assert.calledTwice(_logger);
        sinon.assert.calledWith(_logger, rpc.RpcLog.Level.Error, "Error: Unexpected call to 'log' after function execution has completed. Please check for asynchronous calls that are not awaited or did not use the 'done' callback where expected.");
    });

    it ('function calls callback correctly with bindings', () => {
        callUserFunc(BasicCallback.callbackOnce, _context);
        sinon.assert.calledOnce(_resultCallback);
        sinon.assert.calledWith(_resultCallback, undefined, { bindings: { hello: "world" }, return: undefined });
    });

    it ('empty function does not call callback', () => {
        callUserFunc(BasicCallback.callbackNone, _context);
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

// Does logic in WorkerChannel to call the user function
function callUserFunc(myFunc, context: Context): Promise<any> {
    let result = myFunc(context);
    if (result && isFunction(result.then)) {
        result = result.then(result => (<any>context.done)(null, result, true))
        .catch(err => (<any>context.done)(err, null, true));
    }
    return result;
}