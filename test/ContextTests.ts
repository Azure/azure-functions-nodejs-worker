import { IContext, CreateContextAndInputs, ILogCallback, IResultCallback } from '../src/Context';
import { FunctionInfo } from '../src/FunctionInfo';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { expect } from 'chai';
import * as sinon from 'sinon';
import 'mocha';

describe('Context', () => {
    let _context: IContext;
    let _logger: any;

    beforeEach(() => {
        let info: FunctionInfo = new FunctionInfo({ name: 'test' });
        let msg: rpc.IInvocationRequest = {
            functionId: 'id',
            invocationId: '1',
            inputData: []
        };
        _logger = sinon.spy();
        let resultCallback = <IResultCallback>() => { };

        let { context, inputs } = CreateContextAndInputs(info, msg, _logger, resultCallback);
        _context = context;
    });

    it ('throws error on async function calling context.done', (done) => {
        var promise = asyncThrowsError(_context)
        .then(result => (<any>_context.done)(null, result, true))
        .catch(err => (<any>_context.done)(err, null, true))

        promise.then(() => {
            sinon.assert.calledOnce(_logger);
            expect(_logger);
            sinon.assert.calledWith(_logger, rpc.RpcLog.Level.Error, "Error: Choose either to return a promise or call 'done'.  Do not use both in your script.");
            done();
        })
        .catch(done);
    });

    it ('throws error on function calling context.done more than once', () => {
        callbackTwice(_context);
        sinon.assert.calledOnce(_logger);
        expect(_logger);
        sinon.assert.calledWith(_logger, rpc.RpcLog.Level.Error, "Error: 'done' has already been called. Please check your script for extraneous calls to 'done'.");
    });
})

async function asyncThrowsError(context) {
    context.done();
}

function callbackTwice(context) {
    context.done();
    context.done();
}