// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { RpcInvocationRequest, RpcParameterBinding } from '@azure/functions-core';
import { expect } from 'chai';
import 'mocha';
import * as sinon from 'sinon';
import { CreateContextAndInputs } from '../src/Context';
import { FunctionInfo } from '../src/FunctionInfo';

const timerTriggerInput: RpcParameterBinding = {
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
    let _logger: any;
    let doneEmitter: any;

    beforeEach(() => {
        _logger = sinon.spy();
        doneEmitter = sinon.spy();
    });

    it('camelCases timer trigger input when appropriate', async () => {
        const msg: RpcInvocationRequest = <RpcInvocationRequest>{
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
        const workerOutputs = CreateContextAndInputs(info, msg, _logger, doneEmitter);
        const myTimerWorker = workerOutputs.inputs[0];
        expect(myTimerWorker.schedule).to.be.empty;
        expect(myTimerWorker.scheduleStatus.last).to.equal('2016-10-04T10:15:00+00:00');
        expect(myTimerWorker.scheduleStatus.lastUpdated).to.equal('2016-10-04T10:16:00+00:00');
        expect(myTimerWorker.scheduleStatus.next).to.equal('2016-10-04T10:20:00+00:00');
        expect(myTimerWorker.isPastDue).to.equal(false);
    });

    it('Does not add sys to bindingData for non-http', async () => {
        const msg: RpcInvocationRequest = <RpcInvocationRequest>{
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

        const { context } = CreateContextAndInputs(info, msg, _logger, doneEmitter);
        expect(context.bindingData.sys).to.be.undefined;
        expect(context.bindingData.invocationId).to.equal('1');
        expect(context.invocationId).to.equal('1');
    });

    it('Adds correct sys properties for bindingData and http', async () => {
        const inputDataValue: RpcParameterBinding = {
            name: 'req',
            data: {
                http: {
                    body: {
                        string: 'blahh',
                    },
                },
            },
        };
        const msg: RpcInvocationRequest = <RpcInvocationRequest>{
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

        const { context } = CreateContextAndInputs(info, msg, _logger, doneEmitter);
        const { bindingData } = context;
        expect(bindingData.sys.methodName).to.equal('test');
        expect(bindingData.sys.randGuid).to.not.be.undefined;
        expect(bindingData.sys.utcNow).to.not.be.undefined;
        expect(bindingData.invocationId).to.equal('1');
        expect(context.invocationId).to.equal('1');
    });

    it('Adds correct header and query properties for bindingData and http using nullable values', async () => {
        const inputDataValue: RpcParameterBinding = {
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
        const msg: RpcInvocationRequest = <RpcInvocationRequest>{
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

        const { context } = CreateContextAndInputs(info, msg, _logger, doneEmitter);
        const { bindingData } = context;
        expect(bindingData.invocationId).to.equal('1');
        expect(bindingData.headers.header1).to.equal('value1');
        expect(bindingData.headers.header2).to.equal('');
        expect(bindingData.query.query1).to.equal('value1');
        expect(bindingData.query.query2).to.equal('');
        expect(context.invocationId).to.equal('1');
    });

    it('Adds correct header and query properties for bindingData and http using non-nullable values', async () => {
        const inputDataValue: RpcParameterBinding = {
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
        const msg: RpcInvocationRequest = <RpcInvocationRequest>{
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

        const { context } = CreateContextAndInputs(info, msg, _logger, doneEmitter);
        const { bindingData } = context;
        expect(bindingData.invocationId).to.equal('1');
        expect(bindingData.headers.header1).to.equal('value1');
        expect(bindingData.query.query1).to.equal('value1');
        expect(context.invocationId).to.equal('1');
    });
});
