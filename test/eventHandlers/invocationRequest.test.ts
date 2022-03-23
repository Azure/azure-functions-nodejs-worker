// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

/* eslint-disable deprecation/deprecation */

import { AzureFunction, Context } from '@azure/functions';
import * as workerTypes from '@azure/functions-worker';
import { expect } from 'chai';
import 'mocha';
import * as sinon from 'sinon';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { FunctionInfo } from '../../src/FunctionInfo';
import { FunctionLoader } from '../../src/FunctionLoader';
import { beforeEventHandlerSuite } from './beforeEventHandlerSuite';
import { TestEventStream } from './TestEventStream';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

namespace Binding {
    export const httpInput = {
        type: 'httpTrigger',
        direction: 0,
        dataType: 1,
    };
    export const httpOutput = {
        type: 'http',
        direction: 1,
        dataType: 1,
    };
    export const queueOutput = {
        type: 'queue',
        direction: 1,
        dataType: 1,
    };

    export const httpReturn = {
        bindings: {
            req: httpInput,
            $return: httpOutput,
        },
        name: 'testFuncName',
    };
    export const httpRes = {
        bindings: {
            req: httpInput,
            res: httpOutput,
        },
        name: 'testFuncName',
    };
    export const activity = {
        bindings: {
            name: {
                type: 'activityTrigger',
                direction: 1,
                dataType: 1,
            },
        },
        name: 'testFuncName',
    };
    export const queue = {
        bindings: {
            testOutput: {
                type: 'queue',
                direction: 1,
                dataType: 1,
            },
        },
        name: 'testFuncName',
    };
}

const testError = new Error('testErrorMessage');
testError.stack = 'testErrorStack';

function addSuffix(asyncFunc: AzureFunction, callbackFunc: AzureFunction): [AzureFunction, string][] {
    return [
        [asyncFunc, ' (async)'],
        [callbackFunc, ' (context.done)'],
    ];
}

let hookData: string;

namespace TestFunc {
    const basicAsync = async (context: Context) => {
        context.log('testUserLog');
    };
    const basicCallback = (context: Context) => {
        context.log('testUserLog');
        context.done();
    };
    export const basic = addSuffix(basicAsync, basicCallback);

    const returnHttpAsync = async (_context: Context) => {
        return { body: { hello: 'world' } };
    };
    const returnHttpCallback = (context: Context) => {
        context.done(null, { body: { hello: 'world' } });
    };
    export const returnHttp = addSuffix(returnHttpAsync, returnHttpCallback);

    const returnArrayAsync = async (_context: Context) => {
        return ['hello, seattle!', 'hello, tokyo!'];
    };
    const returnArrayCallback = (context: Context) => {
        context.done(null, ['hello, seattle!', 'hello, tokyo!']);
    };
    export const returnArray = addSuffix(returnArrayAsync, returnArrayCallback);

    const resHttpAsync = async (_context: Context) => {
        return { res: { body: { hello: 'world' } } };
    };
    const resHttpCallback = (context: Context) => {
        context.done(null, { res: { body: { hello: 'world' } } });
    };
    export const resHttp = addSuffix(resHttpAsync, resHttpCallback);

    const logHookDataAsync = async (context: Context) => {
        hookData += 'invoc';
        context.log(hookData);
        return 'hello';
    };
    const logHookDataCallback = (context: Context) => {
        hookData += 'invoc';
        context.log(hookData);
        context.done(null, 'hello');
    };
    export const logHookData = addSuffix(logHookDataAsync, logHookDataCallback);

    const logInputAsync = async (context: Context, input: any) => {
        context.log(input);
    };
    const logInputCallback = (context: Context, input: any) => {
        context.log(input);
        context.done();
    };
    export const logInput = addSuffix(logInputAsync, logInputCallback);

    const multipleBindingsAsync = async (context: Context) => {
        context.bindings.queueOutput = 'queue message';
        context.bindings.overriddenQueueOutput = 'start message';
        return {
            res: { body: { hello: 'world' } },
            overriddenQueueOutput: 'override',
        };
    };
    const multipleBindingsCallback = (context: Context) => {
        context.bindings.queueOutput = 'queue message';
        context.bindings.overriddenQueueOutput = 'start message';
        context.done(null, {
            res: { body: { hello: 'world' } },
            overriddenQueueOutput: 'override',
        });
    };
    export const multipleBindings = addSuffix(multipleBindingsAsync, multipleBindingsCallback);

    const errorAsync = async (_context: Context) => {
        throw testError;
    };
    const errorCallback = (context: Context) => {
        context.done(testError);
    };
    export const error = addSuffix(errorAsync, errorCallback);

    const returnEmptyStringAsync = async (_context: Context) => {
        return '';
    };
    const returnEmptyStringCallback = (context: Context) => {
        context.done(null, '');
    };
    export const returnEmptyString = addSuffix(returnEmptyStringAsync, returnEmptyStringCallback);

    const returnZeroAsync = async (_context: Context) => {
        return 0;
    };
    const returnZeroCallback = (context: Context) => {
        context.done(null, 0);
    };
    export const returnZero = addSuffix(returnZeroAsync, returnZeroCallback);

    const returnFalseAsync = async (_context: Context) => {
        return false;
    };
    const returnFalseCallback = (context: Context) => {
        context.done(null, false);
    };
    export const returnFalse = addSuffix(returnFalseAsync, returnFalseCallback);
}

namespace Msg {
    export const asyncAndDoneLog: rpc.IStreamingMessage = {
        rpcLog: {
            category: 'testFuncName.Invocation',
            invocationId: '1',
            message: "Error: Choose either to return a promise or call 'done'.  Do not use both in your script.",
            level: LogLevel.Error,
            logCategory: LogCategory.User,
        },
    };
    export const duplicateDoneLog: rpc.IStreamingMessage = {
        rpcLog: {
            category: 'testFuncName.Invocation',
            invocationId: '1',
            message: "Error: 'done' has already been called. Please check your script for extraneous calls to 'done'.",
            level: LogLevel.Error,
            logCategory: LogCategory.User,
        },
    };
    export const unexpectedLogAfterDoneLog: rpc.IStreamingMessage = {
        rpcLog: {
            category: 'testFuncName.Invocation',
            invocationId: '1',
            message:
                "Warning: Unexpected call to 'log' on the context object after function execution has completed. Please check for asynchronous calls that are not awaited or calls to 'done' made before function execution completes. Function name: testFuncName. Invocation Id: 1. Learn more: https://go.microsoft.com/fwlink/?linkid=2097909 ",
            level: LogLevel.Warning,
            logCategory: LogCategory.System,
        },
    };
    export function userTestLog(data = 'testUserLog'): rpc.IStreamingMessage {
        return {
            rpcLog: {
                category: 'testFuncName.Invocation',
                invocationId: '1',
                message: data,
                level: LogLevel.Information,
                logCategory: LogCategory.User,
            },
        };
    }
    export const invocResFailed: rpc.IStreamingMessage = {
        requestId: 'testReqId',
        invocationResponse: {
            invocationId: '1',
            result: {
                status: rpc.StatusResult.Status.Failure,
                exception: {
                    message: 'testErrorMessage',
                    stackTrace: 'testErrorStack',
                },
            },
            outputData: [],
        },
    };
    export function receivedInvocLog(): rpc.IStreamingMessage {
        return {
            rpcLog: {
                category: 'testFuncName.Invocation',
                invocationId: '1',
                message: 'Received FunctionInvocationRequest',
                level: LogLevel.Debug,
                logCategory: LogCategory.System,
            },
        };
    }
    export function invocResponse(
        expectedOutputData?: rpc.IParameterBinding[] | null,
        expectedReturnValue?: rpc.ITypedData | null
    ) {
        const msg: rpc.IStreamingMessage = {};
        msg.requestId = 'testReqId';
        msg.invocationResponse = {
            invocationId: '1',
            result: {
                status: rpc.StatusResult.Status.Success,
            },
            outputData: expectedOutputData,
        };
        if (expectedReturnValue !== undefined) {
            msg.invocationResponse.returnValue = expectedReturnValue;
        }
        return msg;
    }
}

namespace InputData {
    export const http = {
        name: 'req',
        data: {
            data: 'http',
            http: {
                body: {
                    string: 'blahh',
                },
                rawBody: {
                    string: 'blahh',
                },
            },
        },
    };

    export const string = {
        name: 'testInput',
        data: {
            data: 'string',
            string: 'testStringData',
        },
    };
}

describe('invocationRequest', () => {
    let stream: TestEventStream;
    let loader: sinon.SinonStubbedInstance<FunctionLoader>;
    let workerApi: typeof workerTypes;
    let testDisposables: workerTypes.Disposable[] = [];

    before(async () => {
        ({ stream, loader } = beforeEventHandlerSuite());
        workerApi = await import('@azure/functions-worker');
    });

    beforeEach(async () => {
        hookData = '';
    });

    afterEach(async () => {
        await stream.afterEachEventHandlerTest();
        workerApi.Disposable.from(...testDisposables).dispose();
        testDisposables = [];
    });

    function sendInvokeMessage(inputData?: rpc.IParameterBinding[] | null): void {
        stream.addTestMessage({
            requestId: 'testReqId',
            invocationRequest: {
                functionId: 'id',
                invocationId: '1',
                inputData: inputData,
            },
        });
    }

    function getHttpResponse(rawBody?: string | {} | undefined, name = 'res'): rpc.IParameterBinding {
        let body: rpc.ITypedData;
        if (typeof rawBody === 'string') {
            body = { string: rawBody };
        } else if (rawBody === undefined) {
            body = { json: rawBody };
        } else {
            body = { json: JSON.stringify(rawBody) };
        }

        return {
            data: {
                http: {
                    body,
                    cookies: [],
                    headers: {},
                    statusCode: undefined,
                },
            },
            name,
        };
    }

    for (const [func, suffix] of TestFunc.basic) {
        it('invokes function' + suffix, async () => {
            loader.getFunc.returns(func);
            loader.getInfo.returns(new FunctionInfo(Binding.httpRes));
            sendInvokeMessage([InputData.http]);
            await stream.assertCalledWith(
                Msg.receivedInvocLog(),
                Msg.userTestLog(),
                Msg.invocResponse([getHttpResponse()])
            );
        });
    }

    for (const [func, suffix] of TestFunc.returnHttp) {
        it('returns correct data with $return binding' + suffix, async () => {
            loader.getFunc.returns(func);
            loader.getInfo.returns(new FunctionInfo(Binding.httpReturn));
            sendInvokeMessage([InputData.http]);
            const expectedOutput = getHttpResponse(undefined, '$return');
            const expectedReturnValue = {
                http: {
                    body: { json: '{"hello":"world"}' },
                    cookies: [],
                    headers: {},
                    statusCode: undefined,
                },
            };
            await stream.assertCalledWith(
                Msg.receivedInvocLog(),
                Msg.invocResponse([expectedOutput], expectedReturnValue)
            );
        });
    }

    for (const [func, suffix] of TestFunc.returnArray) {
        it('returns returned output if not http' + suffix, async () => {
            loader.getFunc.returns(func);
            loader.getInfo.returns(new FunctionInfo(Binding.queue));
            sendInvokeMessage([]);
            const expectedReturnValue = {
                json: '["hello, seattle!","hello, tokyo!"]',
            };
            await stream.assertCalledWith(Msg.receivedInvocLog(), Msg.invocResponse([], expectedReturnValue));
        });
    }

    for (const [func, suffix] of TestFunc.returnArray) {
        it('returned output is ignored if http' + suffix, async () => {
            loader.getFunc.returns(func);
            loader.getInfo.returns(new FunctionInfo(Binding.httpRes));
            sendInvokeMessage([]);
            await stream.assertCalledWith(Msg.receivedInvocLog(), Msg.invocResponse([], undefined));
        });
    }

    for (const [func, suffix] of TestFunc.resHttp) {
        it('serializes output binding data through context.done' + suffix, async () => {
            loader.getFunc.returns(func);
            loader.getInfo.returns(new FunctionInfo(Binding.httpRes));
            sendInvokeMessage([InputData.http]);
            const expectedOutput = [getHttpResponse({ hello: 'world' })];
            await stream.assertCalledWith(Msg.receivedInvocLog(), Msg.invocResponse(expectedOutput));
        });
    }

    for (const [func, suffix] of TestFunc.multipleBindings) {
        it('serializes multiple output bindings through context.done and context.bindings' + suffix, async () => {
            loader.getFunc.returns(func);
            loader.getInfo.returns(
                new FunctionInfo({
                    bindings: {
                        req: Binding.httpInput,
                        res: Binding.httpOutput,
                        queueOutput: Binding.queueOutput,
                        overriddenQueueOutput: Binding.queueOutput,
                    },
                    name: 'testFuncName',
                })
            );
            sendInvokeMessage([InputData.http]);
            const expectedOutput = [
                getHttpResponse({ hello: 'world' }),
                {
                    data: {
                        string: 'override',
                    },
                    name: 'overriddenQueueOutput',
                },
                {
                    data: {
                        string: 'queue message',
                    },
                    name: 'queueOutput',
                },
            ];
            await stream.assertCalledWith(Msg.receivedInvocLog(), Msg.invocResponse(expectedOutput));
        });
    }

    for (const [func, suffix] of TestFunc.error) {
        it('returns failed status for user error' + suffix, async () => {
            loader.getFunc.returns(func);
            loader.getInfo.returns(new FunctionInfo(Binding.queue));
            sendInvokeMessage([InputData.http]);
            await stream.assertCalledWith(Msg.receivedInvocLog(), Msg.invocResFailed);
        });
    }

    it('throws for malformed messages', () => {
        expect(() => {
            stream.write(<any>{
                functionLoadResponse: 1,
            });
        }).to.throw('functionLoadResponse.object expected');
    });

    it('empty function does not return invocation response', async () => {
        loader.getFunc.returns(() => {});
        loader.getInfo.returns(new FunctionInfo(Binding.httpRes));
        sendInvokeMessage([InputData.http]);
        await stream.assertCalledWith(Msg.receivedInvocLog());
    });

    it('logs error on calling context.done in async function', async () => {
        loader.getFunc.returns(async (context: Context) => {
            context.done();
        });
        loader.getInfo.returns(new FunctionInfo(Binding.httpRes));
        sendInvokeMessage([InputData.http]);
        await stream.assertCalledWith(
            Msg.receivedInvocLog(),
            Msg.asyncAndDoneLog,
            Msg.invocResponse([getHttpResponse()])
        );
    });

    it('logs error on calling context.done more than once', async () => {
        loader.getFunc.returns((context: Context) => {
            context.done();
            context.done();
        });
        loader.getInfo.returns(new FunctionInfo(Binding.httpRes));
        sendInvokeMessage([InputData.http]);
        await stream.assertCalledWith(
            Msg.receivedInvocLog(),
            Msg.duplicateDoneLog,
            Msg.invocResponse([getHttpResponse()])
        );
    });

    it('logs error on calling context.log after context.done', async () => {
        loader.getFunc.returns((context: Context) => {
            context.done();
            context.log('testUserLog');
        });
        loader.getInfo.returns(new FunctionInfo(Binding.httpRes));
        sendInvokeMessage([InputData.http]);
        await stream.assertCalledWith(
            Msg.receivedInvocLog(),
            Msg.unexpectedLogAfterDoneLog,
            Msg.userTestLog(),
            Msg.invocResponse([getHttpResponse()])
        );
    });

    it('logs error on calling context.log after async function', async () => {
        let _context: Context;
        loader.getFunc.returns(async (context: Context) => {
            _context = context;
            return 'hello';
        });
        loader.getInfo.returns(new FunctionInfo(Binding.httpRes));
        sendInvokeMessage([InputData.http]);
        // wait for first two messages to ensure invocation happens
        await stream.assertCalledWith(Msg.receivedInvocLog(), Msg.invocResponse([getHttpResponse()]));
        // then add extra context.log
        _context!.log('testUserLog');
        await stream.assertCalledWith(Msg.unexpectedLogAfterDoneLog, Msg.userTestLog());
    });

    for (const [func, suffix] of TestFunc.logHookData) {
        it('preInvocationHook' + suffix, async () => {
            loader.getFunc.returns(func);
            loader.getInfo.returns(new FunctionInfo(Binding.queue));

            testDisposables.push(
                workerApi.registerHook('preInvocation', () => {
                    hookData += 'pre';
                })
            );

            sendInvokeMessage([InputData.http]);
            await stream.assertCalledWith(
                Msg.receivedInvocLog(),
                Msg.userTestLog('preinvoc'),
                Msg.invocResponse([], { string: 'hello' })
            );
            expect(hookData).to.equal('preinvoc');
        });
    }

    for (const [func, suffix] of TestFunc.logInput) {
        it('preInvocationHook respects change to inputs' + suffix, async () => {
            loader.getFunc.returns(func);
            loader.getInfo.returns(new FunctionInfo(Binding.queue));

            testDisposables.push(
                workerApi.registerHook('preInvocation', (context: workerTypes.PreInvocationContext) => {
                    expect(context.inputs.length).to.equal(1);
                    expect(context.inputs[0]).to.equal('testStringData');
                    context.inputs = ['changedStringData'];
                })
            );

            sendInvokeMessage([InputData.string]);
            await stream.assertCalledWith(
                Msg.receivedInvocLog(),
                Msg.userTestLog('changedStringData'),
                Msg.invocResponse([])
            );
        });
    }

    for (const [func, suffix] of TestFunc.logHookData) {
        it('postInvocationHook' + suffix, async () => {
            loader.getFunc.returns(func);
            loader.getInfo.returns(new FunctionInfo(Binding.queue));

            testDisposables.push(
                workerApi.registerHook('postInvocation', (context: workerTypes.PostInvocationContext) => {
                    hookData += 'post';
                    expect(context.result).to.equal('hello');
                    expect(context.error).to.be.null;
                })
            );

            sendInvokeMessage([InputData.http]);
            await stream.assertCalledWith(
                Msg.receivedInvocLog(),
                Msg.userTestLog('invoc'),
                Msg.invocResponse([], { string: 'hello' })
            );
            expect(hookData).to.equal('invocpost');
        });
    }

    for (const [func, suffix] of TestFunc.logHookData) {
        it('postInvocationHook respects change to context.result' + suffix, async () => {
            loader.getFunc.returns(func);
            loader.getInfo.returns(new FunctionInfo(Binding.queue));

            testDisposables.push(
                workerApi.registerHook('postInvocation', (context: workerTypes.PostInvocationContext) => {
                    hookData += 'post';
                    expect(context.result).to.equal('hello');
                    expect(context.error).to.be.null;
                    context.result = 'world';
                })
            );

            sendInvokeMessage([InputData.http]);
            await stream.assertCalledWith(
                Msg.receivedInvocLog(),
                Msg.userTestLog('invoc'),
                Msg.invocResponse([], { string: 'world' })
            );
            expect(hookData).to.equal('invocpost');
        });
    }

    for (const [func, suffix] of TestFunc.error) {
        it('postInvocationHook executes if function throws error' + suffix, async () => {
            loader.getFunc.returns(func);
            loader.getInfo.returns(new FunctionInfo(Binding.queue));

            testDisposables.push(
                workerApi.registerHook('postInvocation', (context: workerTypes.PostInvocationContext) => {
                    hookData += 'post';
                    expect(context.result).to.be.null;
                    expect(context.error).to.equal(testError);
                })
            );

            sendInvokeMessage([InputData.http]);
            await stream.assertCalledWith(Msg.receivedInvocLog(), Msg.invocResFailed);
            expect(hookData).to.equal('post');
        });
    }

    for (const [func, suffix] of TestFunc.error) {
        it('postInvocationHook respects change to context.error' + suffix, async () => {
            loader.getFunc.returns(func);
            loader.getInfo.returns(new FunctionInfo(Binding.queue));

            testDisposables.push(
                workerApi.registerHook('postInvocation', (context: workerTypes.PostInvocationContext) => {
                    hookData += 'post';
                    expect(context.result).to.be.null;
                    expect(context.error).to.equal(testError);
                    context.error = null;
                    context.result = 'hello';
                })
            );

            sendInvokeMessage([InputData.http]);
            await stream.assertCalledWith(Msg.receivedInvocLog(), Msg.invocResponse([], { string: 'hello' }));
            expect(hookData).to.equal('post');
        });
    }

    it('pre and post invocation hooks share data', async () => {
        loader.getFunc.returns(async () => {});
        loader.getInfo.returns(new FunctionInfo(Binding.queue));

        testDisposables.push(
            workerApi.registerHook('preInvocation', (context: workerTypes.PreInvocationContext) => {
                context.hookData['hello'] = 'world';
                hookData += 'pre';
            })
        );

        testDisposables.push(
            workerApi.registerHook('postInvocation', (context: workerTypes.PostInvocationContext) => {
                expect(context.hookData['hello']).to.equal('world');
                hookData += 'post';
            })
        );

        sendInvokeMessage([InputData.http]);
        await stream.assertCalledWith(Msg.receivedInvocLog(), Msg.invocResponse([]));
        expect(hookData).to.equal('prepost');
    });

    it('dispose hooks', async () => {
        loader.getFunc.returns(async () => {});
        loader.getInfo.returns(new FunctionInfo(Binding.queue));

        const disposableA: workerTypes.Disposable = workerApi.registerHook('preInvocation', () => {
            hookData += 'a';
        });
        testDisposables.push(disposableA);
        const disposableB: workerTypes.Disposable = workerApi.registerHook('preInvocation', () => {
            hookData += 'b';
        });
        testDisposables.push(disposableB);

        sendInvokeMessage([InputData.http]);
        await stream.assertCalledWith(Msg.receivedInvocLog(), Msg.invocResponse([]));
        expect(hookData).to.equal('ab');

        disposableA.dispose();
        sendInvokeMessage([InputData.http]);
        await stream.assertCalledWith(Msg.receivedInvocLog(), Msg.invocResponse([]));
        expect(hookData).to.equal('abb');

        disposableB.dispose();
        sendInvokeMessage([InputData.http]);
        await stream.assertCalledWith(Msg.receivedInvocLog(), Msg.invocResponse([]));
        expect(hookData).to.equal('abb');
    });

    for (const [func, suffix] of TestFunc.returnEmptyString) {
        it('returns and serializes falsy value in Durable: ""' + suffix, async () => {
            loader.getFunc.returns(func);
            loader.getInfo.returns(new FunctionInfo(Binding.activity));
            sendInvokeMessage([]);
            const expectedReturnValue = { string: '' };
            await stream.assertCalledWith(Msg.receivedInvocLog(), Msg.invocResponse([], expectedReturnValue));
        });
    }

    for (const [func, suffix] of TestFunc.returnZero) {
        it('returns and serializes falsy value in Durable: 0' + suffix, async () => {
            loader.getFunc.returns(func);
            loader.getInfo.returns(new FunctionInfo(Binding.activity));
            sendInvokeMessage([]);
            const expectedReturnValue = { int: 0 };
            await stream.assertCalledWith(Msg.receivedInvocLog(), Msg.invocResponse([], expectedReturnValue));
        });
    }

    for (const [func, suffix] of TestFunc.returnFalse) {
        it('returns and serializes falsy value in Durable: false' + suffix, async () => {
            loader.getFunc.returns(func);
            loader.getInfo.returns(new FunctionInfo(Binding.activity));
            sendInvokeMessage([]);
            const expectedReturnValue = { json: 'false' };
            await stream.assertCalledWith(Msg.receivedInvocLog(), Msg.invocResponse([], expectedReturnValue));
        });
    }
});
