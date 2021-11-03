// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { Context } from '@azure/functions';
import { expect } from 'chai';
import 'mocha';
import * as sinon from 'sinon';
import { isFunction } from 'util';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { CreateContextAndInputs } from '../src/Context';
import { FunctionInfo } from '../src/FunctionInfo';

const timerTriggerInput: rpc.IParameterBinding = {
    name: 'myTimer',
    data: {
        json: JSON.stringify({
            Schedule: {},
            ScheduleStatus: {
                Last: '2016-10-04T10:15:00+00:00',
                LastUpdated: '2016-10-04T10:16:00+00:00',
                Next: '2016-10-04T10:20:00+00:00',
            },
            IsPastDue: false,
        }),
    },
};

describe('Context', () => {
    let _context: Context;
    let _logger: any;
    let _resultCallback: any;

    beforeEach(() => {
        const info: FunctionInfo = new FunctionInfo({ name: 'test' });
        const msg: rpc.IInvocationRequest = {
            functionId: 'id',
            invocationId: '1',
            inputData: [],
        };
        _logger = sinon.spy();
        _resultCallback = sinon.spy();

        const v1WorkerBehavior = false;
        const { context, inputs } = CreateContextAndInputs(info, msg, _logger, _resultCallback, v1WorkerBehavior);
        _context = context;
    });

    it('camelCases timer trigger input when appropriate', async () => {
        const msg: rpc.IInvocationRequest = <rpc.IInvocationRequest>{
            functionId: 'id',
            invocationId: '1',
            inputData: [timerTriggerInput],
        };

        const info: FunctionInfo = new FunctionInfo({
            name: 'test',
            bindings: {
                myTimer: {
                    type: 'timerTrigger',
                    direction: 0,
                    dataType: 0,
                },
            },
        });
        // Node.js Worker V2 behavior
        const workerV2Outputs = CreateContextAndInputs(info, msg, _logger, _resultCallback, false);
        const myTimerWorkerV2 = workerV2Outputs.inputs[0];
        expect(myTimerWorkerV2.schedule).to.be.empty;
        expect(myTimerWorkerV2.scheduleStatus.last).to.equal('2016-10-04T10:15:00+00:00');
        expect(myTimerWorkerV2.scheduleStatus.lastUpdated).to.equal('2016-10-04T10:16:00+00:00');
        expect(myTimerWorkerV2.scheduleStatus.next).to.equal('2016-10-04T10:20:00+00:00');
        expect(myTimerWorkerV2.isPastDue).to.equal(false);

        // Node.js Worker V1 behavior
        const workerV1Outputs = CreateContextAndInputs(info, msg, _logger, _resultCallback, true);
        const myTimerWorkerV1 = workerV1Outputs.inputs[0];
        expect(myTimerWorkerV1.Schedule).to.be.empty;
        expect(myTimerWorkerV1.ScheduleStatus.Last).to.equal('2016-10-04T10:15:00+00:00');
        expect(myTimerWorkerV1.ScheduleStatus.LastUpdated).to.equal('2016-10-04T10:16:00+00:00');
        expect(myTimerWorkerV1.ScheduleStatus.Next).to.equal('2016-10-04T10:20:00+00:00');
        expect(myTimerWorkerV1.IsPastDue).to.equal(false);
    });

    it('Does not add sys to bindingData for non-http', async () => {
        const msg: rpc.IInvocationRequest = <rpc.IInvocationRequest>{
            functionId: 'id',
            invocationId: '1',
            inputData: [timerTriggerInput],
        };

        const info: FunctionInfo = new FunctionInfo({
            name: 'test',
            bindings: {
                req: {
                    type: 'http',
                    direction: 0,
                    dataType: 1,
                },
            },
        });

        const { context } = CreateContextAndInputs(info, msg, _logger, _resultCallback, false);
        expect(context.bindingData.sys).to.be.undefined;
        expect(context.bindingData.invocationId).to.equal('1');
        expect(context.invocationId).to.equal('1');
    });

    it('Adds correct sys properties for bindingData and http', async () => {
        const inputDataValue: rpc.IParameterBinding = {
            name: 'req',
            data: {
                http: {
                    body: {
                        string: 'blahh',
                    },
                },
            },
        };
        const msg: rpc.IInvocationRequest = <rpc.IInvocationRequest>{
            functionId: 'id',
            invocationId: '1',
            inputData: [inputDataValue],
        };

        const info: FunctionInfo = new FunctionInfo({
            name: 'test',
            bindings: {
                req: {
                    type: 'http',
                    direction: 0,
                    dataType: 1,
                },
            },
        });

        const { context } = CreateContextAndInputs(info, msg, _logger, _resultCallback, false);
        const { bindingData } = context;
        expect(bindingData.sys.methodName).to.equal('test');
        expect(bindingData.sys.randGuid).to.not.be.undefined;
        expect(bindingData.sys.utcNow).to.not.be.undefined;
        expect(bindingData.invocationId).to.equal('1');
        expect(context.invocationId).to.equal('1');
    });

    it('Adds correct header and query properties for bindingData and http using nullable values', async () => {
        const inputDataValue: rpc.IParameterBinding = {
            name: 'req',
            data: {
                http: {
                    body: {
                        string: 'blahh',
                    },
                    nullableHeaders: {
                        header1: {
                            value: 'value1',
                        },
                        header2: {
                            value: '',
                        },
                    },
                    nullableQuery: {
                        query1: {
                            value: 'value1',
                        },
                        query2: {
                            value: undefined,
                        },
                    },
                },
            },
        };
        const msg: rpc.IInvocationRequest = <rpc.IInvocationRequest>{
            functionId: 'id',
            invocationId: '1',
            inputData: [inputDataValue],
        };

        const info: FunctionInfo = new FunctionInfo({
            name: 'test',
            bindings: {
                req: {
                    type: 'http',
                    direction: 0,
                    dataType: 1,
                },
            },
        });

        const { context } = CreateContextAndInputs(info, msg, _logger, _resultCallback, false);
        const { bindingData } = context;
        expect(bindingData.invocationId).to.equal('1');
        expect(bindingData.headers.header1).to.equal('value1');
        expect(bindingData.headers.header2).to.equal('');
        expect(bindingData.query.query1).to.equal('value1');
        expect(bindingData.query.query2).to.equal('');
        expect(context.invocationId).to.equal('1');
    });

    it('Adds correct header and query properties for bindingData and http using non-nullable values', async () => {
        const inputDataValue: rpc.IParameterBinding = {
            name: 'req',
            data: {
                http: {
                    body: {
                        string: 'blahh',
                    },
                    headers: {
                        header1: 'value1',
                    },
                    query: {
                        query1: 'value1',
                    },
                },
            },
        };
        const msg: rpc.IInvocationRequest = <rpc.IInvocationRequest>{
            functionId: 'id',
            invocationId: '1',
            inputData: [inputDataValue],
        };

        const info: FunctionInfo = new FunctionInfo({
            name: 'test',
            bindings: {
                req: {
                    type: 'http',
                    direction: 0,
                    dataType: 1,
                },
            },
        });

        const { context } = CreateContextAndInputs(info, msg, _logger, _resultCallback, false);
        const { bindingData } = context;
        expect(bindingData.invocationId).to.equal('1');
        expect(bindingData.headers.header1).to.equal('value1');
        expect(bindingData.query.query1).to.equal('value1');
        expect(context.invocationId).to.equal('1');
    });

    it('async function logs error on calling context.done', async () => {
        await callUserFunc(BasicAsync.asyncAndCallback, _context);
        sinon.assert.calledOnce(_logger);
        sinon.assert.calledWith(
            _logger,
            rpc.RpcLog.Level.Error,
            rpc.RpcLog.RpcLogCategory.User,
            "Error: Choose either to return a promise or call 'done'.  Do not use both in your script."
        );
    });

    it('async function calls callback and returns value without context.done', async () => {
        await callUserFunc(BasicAsync.asyncPlainFunction, _context);
        sinon.assert.calledOnce(_resultCallback);
        sinon.assert.calledWith(_resultCallback, null, { bindings: {}, return: 'hello' });
    });

    it('function logs error on calling context.done more than once', () => {
        callUserFunc(BasicCallback.callbackTwice, _context);
        sinon.assert.calledOnce(_logger);
        sinon.assert.calledWith(
            _logger,
            rpc.RpcLog.Level.Error,
            rpc.RpcLog.RpcLogCategory.User,
            "Error: 'done' has already been called. Please check your script for extraneous calls to 'done'."
        );
    });

    it('function logs error on calling context.log after context.done() called', () => {
        callUserFunc(BasicCallback.callbackOnce, _context);
        _context.log('');
        sinon.assert.calledTwice(_logger);
        sinon.assert.calledWith(
            _logger,
            rpc.RpcLog.Level.Warning,
            rpc.RpcLog.RpcLogCategory.System,
            "Warning: Unexpected call to 'log' on the context object after function execution has completed. Please check for asynchronous calls that are not awaited or calls to 'done' made before function execution completes. Function name: test. Invocation Id: 1. Learn more: https://go.microsoft.com/fwlink/?linkid=2097909 "
        );
    });

    it('function logs error on calling context.log from non-awaited async call', async () => {
        await callUserFunc(BasicAsync.asyncPlainFunction, _context);
        _context.log('');
        sinon.assert.calledTwice(_logger);
        sinon.assert.calledWith(
            _logger,
            rpc.RpcLog.Level.Warning,
            rpc.RpcLog.RpcLogCategory.System,
            "Warning: Unexpected call to 'log' on the context object after function execution has completed. Please check for asynchronous calls that are not awaited or calls to 'done' made before function execution completes. Function name: test. Invocation Id: 1. Learn more: https://go.microsoft.com/fwlink/?linkid=2097909 "
        );
    });

    it('function calls callback correctly with bindings', () => {
        callUserFunc(BasicCallback.callbackOnce, _context);
        sinon.assert.calledOnce(_resultCallback);
        sinon.assert.calledWith(_resultCallback, undefined, { bindings: { hello: 'world' }, return: undefined });
    });

    it('empty function does not call callback', () => {
        callUserFunc(BasicCallback.callbackNone, _context);
        sinon.assert.notCalled(_resultCallback);
    });
});

// async test functions
class BasicAsync {
    public static async asyncAndCallback(context: Context) {
        context.done();
    }

    public static async asyncPlainFunction(context: Context) {
        return 'hello';
    }
}

// sync test functions
class BasicCallback {
    public static callbackTwice(context) {
        context.done();
        context.done();
    }

    public static callbackOnce(context) {
        context.bindings = { hello: 'world' };
        context.done();
    }

    public static callbackNone(context) {}
}

// Does logic in WorkerChannel to call the user function
function callUserFunc(myFunc, context: Context): Promise<any> {
    let result = myFunc(context);
    if (result && isFunction(result.then)) {
        result = result
            .then((result) => (<any>context.done)(null, result, true))
            .catch((err) => (<any>context.done)(err, null, true));
    }
    return result;
}
