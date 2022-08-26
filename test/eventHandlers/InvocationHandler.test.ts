// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

/* eslint-disable deprecation/deprecation */

import { AzureFunction, Context } from '@azure/functions';
import * as coreTypes from '@azure/functions-core';
import { expect } from 'chai';
import 'mocha';
import * as sinon from 'sinon';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { LegacyFunctionLoader } from '../../src/LegacyFunctionLoader';
import { WorkerChannel } from '../../src/WorkerChannel';
import { Msg as AppStartMsg } from '../startApp.test';
import { beforeEventHandlerSuite } from './beforeEventHandlerSuite';
import { Msg as WorkerTerminateMsg } from './terminateWorker.test';
import { TestEventStream } from './TestEventStream';
import { Msg as WorkerInitMsg } from './WorkerInitHandler.test';
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
            message:
                "Error: Choose either to return a promise or call 'done'. Do not use both in your script. Learn more: https://go.microsoft.com/fwlink/?linkid=2097909",
            level: LogLevel.Error,
            logCategory: LogCategory.System,
        },
    };
    export const duplicateDoneLog: rpc.IStreamingMessage = {
        rpcLog: {
            category: 'testFuncName.Invocation',
            invocationId: '1',
            message: "Error: 'done' has already been called. Please check your script for extraneous calls to 'done'.",
            level: LogLevel.Error,
            logCategory: LogCategory.System,
        },
    };
    export const unexpectedLogAfterDoneLog: rpc.IStreamingMessage = {
        rpcLog: {
            category: 'testFuncName.Invocation',
            invocationId: '1',
            message:
                "Warning: Unexpected call to 'log' on the context object after function execution has completed. Please check for asynchronous calls that are not awaited or calls to 'done' made before function execution completes. Function name: testFuncName. Invocation Id: 1. Learn more: https://go.microsoft.com/fwlink/?linkid=2097909",
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
    export function executingHooksLog(count: number, hookName: string): rpc.IStreamingMessage {
        return {
            rpcLog: {
                category: 'testFuncName.Invocation',
                invocationId: '1',
                message: `Executing ${count} "${hookName}" hooks`,
                level: LogLevel.Debug,
                logCategory: LogCategory.System,
            },
        };
    }
    export function executedHooksLog(hookName: string): rpc.IStreamingMessage {
        return {
            rpcLog: {
                category: 'testFuncName.Invocation',
                invocationId: '1',
                message: `Executed "${hookName}" hooks`,
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

type TestFunctionLoader = sinon.SinonStubbedInstance<
    LegacyFunctionLoader & {
        getFunction(functionId: string): { metadata: rpc.IRpcFunctionMetadata; callback: AzureFunction };
    }
>;

describe('InvocationHandler', () => {
    let stream: TestEventStream;
    let loader: TestFunctionLoader;
    let channel: WorkerChannel;
    let coreApi: typeof coreTypes;
    let testDisposables: coreTypes.Disposable[] = [];
    let processExitStub: sinon.SinonStub;

    before(async () => {
        const result = beforeEventHandlerSuite();
        stream = result.stream;
        loader = <TestFunctionLoader>result.loader;
        channel = result.channel;
        coreApi = await import('@azure/functions-core');
        processExitStub = sinon.stub(process, 'exit');
    });

    beforeEach(async () => {
        hookData = '';
        channel.appHookData = {};
        channel.appLevelOnlyHookData = {};
    });

    afterEach(async () => {
        await stream.afterEachEventHandlerTest();
        coreApi.Disposable.from(...testDisposables).dispose();
        testDisposables = [];
    });

    after(() => {
        processExitStub.restore();
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
            loader.getFunction.returns({
                metadata: Binding.httpRes,
                callback: func,
            });
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
            loader.getFunction.returns({
                metadata: Binding.httpReturn,
                callback: func,
            });
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
            loader.getFunction.returns({
                metadata: Binding.queue,
                callback: func,
            });
            sendInvokeMessage([]);
            const expectedReturnValue = {
                json: '["hello, seattle!","hello, tokyo!"]',
            };
            await stream.assertCalledWith(Msg.receivedInvocLog(), Msg.invocResponse([], expectedReturnValue));
        });
    }

    for (const [func, suffix] of TestFunc.returnArray) {
        it('returned output is ignored if http' + suffix, async () => {
            loader.getFunction.returns({
                metadata: Binding.httpRes,
                callback: func,
            });
            sendInvokeMessage([]);
            await stream.assertCalledWith(Msg.receivedInvocLog(), Msg.invocResponse([], undefined));
        });
    }

    for (const [func, suffix] of TestFunc.resHttp) {
        it('serializes output binding data through context.done' + suffix, async () => {
            loader.getFunction.returns({
                metadata: Binding.httpRes,
                callback: func,
            });
            sendInvokeMessage([InputData.http]);
            const expectedOutput = [getHttpResponse({ hello: 'world' })];
            await stream.assertCalledWith(Msg.receivedInvocLog(), Msg.invocResponse(expectedOutput));
        });
    }

    for (const [func, suffix] of TestFunc.multipleBindings) {
        it('serializes multiple output bindings through context.done and context.bindings' + suffix, async () => {
            loader.getFunction.returns({
                metadata: {
                    bindings: {
                        req: Binding.httpInput,
                        res: Binding.httpOutput,
                        queueOutput: Binding.queueOutput,
                        overriddenQueueOutput: Binding.queueOutput,
                    },
                    name: 'testFuncName',
                },
                callback: func,
            });
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
            loader.getFunction.returns({
                metadata: Binding.queue,
                callback: func,
            });
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
        loader.getFunction.returns({
            callback: () => {},
            metadata: Binding.httpRes,
        });
        sendInvokeMessage([InputData.http]);
        await stream.assertCalledWith(Msg.receivedInvocLog());
    });

    it('logs error on calling context.done in async function', async () => {
        loader.getFunction.returns({
            callback: async (context: Context) => {
                context.done();
            },
            metadata: Binding.httpRes,
        });
        sendInvokeMessage([InputData.http]);
        await stream.assertCalledWith(
            Msg.receivedInvocLog(),
            Msg.asyncAndDoneLog,
            Msg.invocResponse([getHttpResponse()])
        );
    });

    it('logs error on calling context.done more than once', async () => {
        loader.getFunction.returns({
            callback: (context: Context) => {
                context.done();
                context.done();
            },
            metadata: Binding.httpRes,
        });
        sendInvokeMessage([InputData.http]);
        await stream.assertCalledWith(
            Msg.receivedInvocLog(),
            Msg.duplicateDoneLog,
            Msg.invocResponse([getHttpResponse()])
        );
    });

    it('logs error on calling context.log after context.done', async () => {
        loader.getFunction.returns({
            callback: (context: Context) => {
                context.done();
                context.log('testUserLog');
            },
            metadata: Binding.httpRes,
        });
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
        loader.getFunction.returns({
            callback: async (context: Context) => {
                _context = context;
                return 'hello';
            },
            metadata: Binding.httpRes,
        });
        sendInvokeMessage([InputData.http]);
        // wait for first two messages to ensure invocation happens
        await stream.assertCalledWith(Msg.receivedInvocLog(), Msg.invocResponse([getHttpResponse()]));
        // then add extra context.log
        _context!.log('testUserLog');
        await stream.assertCalledWith(Msg.unexpectedLogAfterDoneLog, Msg.userTestLog());
    });

    for (const [func, suffix] of TestFunc.logHookData) {
        it('preInvocationHook' + suffix, async () => {
            loader.getFunction.returns({
                metadata: Binding.queue,
                callback: func,
            });

            testDisposables.push(
                coreApi.registerHook('preInvocation', () => {
                    hookData += 'pre';
                })
            );

            sendInvokeMessage([InputData.http]);
            await stream.assertCalledWith(
                Msg.receivedInvocLog(),
                Msg.executingHooksLog(1, 'preInvocation'),
                Msg.executedHooksLog('preInvocation'),
                Msg.userTestLog('preinvoc'),
                Msg.invocResponse([], { string: 'hello' })
            );
            expect(hookData).to.equal('preinvoc');
        });
    }

    for (const [func, suffix] of TestFunc.logInput) {
        it('preInvocationHook respects change to inputs' + suffix, async () => {
            loader.getFunction.returns({
                metadata: Binding.queue,
                callback: func,
            });

            testDisposables.push(
                coreApi.registerHook('preInvocation', (context: coreTypes.PreInvocationContext) => {
                    expect(context.inputs.length).to.equal(1);
                    expect(context.inputs[0]).to.equal('testStringData');
                    context.inputs = ['changedStringData'];
                })
            );

            sendInvokeMessage([InputData.string]);
            await stream.assertCalledWith(
                Msg.receivedInvocLog(),
                Msg.executingHooksLog(1, 'preInvocation'),
                Msg.executedHooksLog('preInvocation'),
                Msg.userTestLog('changedStringData'),
                Msg.invocResponse([])
            );
        });
    }

    it('preInvocationHook respects change to functionCallback', async () => {
        loader.getFunction.returns({
            metadata: Binding.queue,
            callback: async (invocContext: Context) => {
                invocContext.log('old function');
            },
        });

        testDisposables.push(
            coreApi.registerHook('preInvocation', (context: coreTypes.PreInvocationContext) => {
                expect(context.functionCallback).to.be.a('function');
                context.functionCallback = <coreTypes.FunctionCallback>(async (invocContext: Context) => {
                    invocContext.log('new function');
                });
            })
        );

        sendInvokeMessage([InputData.string]);
        await stream.assertCalledWith(
            Msg.receivedInvocLog(),
            Msg.executingHooksLog(1, 'preInvocation'),
            Msg.executedHooksLog('preInvocation'),
            Msg.userTestLog('new function'),
            Msg.invocResponse([])
        );
    });

    for (const [func, suffix] of TestFunc.logHookData) {
        it('postInvocationHook' + suffix, async () => {
            channel.functions;
            loader.getFunction.returns({
                metadata: Binding.queue,
                callback: func,
            });

            testDisposables.push(
                coreApi.registerHook('postInvocation', (context: coreTypes.PostInvocationContext) => {
                    hookData += 'post';
                    expect(context.result).to.equal('hello');
                    expect(context.error).to.be.null;
                    (<Context>context.invocationContext).log('hello from post');
                })
            );

            sendInvokeMessage([InputData.http]);
            await stream.assertCalledWith(
                Msg.receivedInvocLog(),
                Msg.userTestLog('invoc'),
                Msg.executingHooksLog(1, 'postInvocation'),
                Msg.userTestLog('hello from post'),
                Msg.executedHooksLog('postInvocation'),
                Msg.invocResponse([], { string: 'hello' })
            );
            expect(hookData).to.equal('invocpost');
        });
    }

    for (const [func, suffix] of TestFunc.logHookData) {
        it('postInvocationHook respects change to context.result' + suffix, async () => {
            loader.getFunction.returns({
                metadata: Binding.queue,
                callback: func,
            });

            testDisposables.push(
                coreApi.registerHook('postInvocation', (context: coreTypes.PostInvocationContext) => {
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
                Msg.executingHooksLog(1, 'postInvocation'),
                Msg.executedHooksLog('postInvocation'),
                Msg.invocResponse([], { string: 'world' })
            );
            expect(hookData).to.equal('invocpost');
        });
    }

    for (const [func, suffix] of TestFunc.error) {
        it('postInvocationHook executes if function throws error' + suffix, async () => {
            loader.getFunction.returns({
                metadata: Binding.queue,
                callback: func,
            });

            testDisposables.push(
                coreApi.registerHook('postInvocation', (context: coreTypes.PostInvocationContext) => {
                    hookData += 'post';
                    expect(context.result).to.be.null;
                    expect(context.error).to.equal(testError);
                })
            );

            sendInvokeMessage([InputData.http]);
            await stream.assertCalledWith(
                Msg.receivedInvocLog(),
                Msg.executingHooksLog(1, 'postInvocation'),
                Msg.executedHooksLog('postInvocation'),
                Msg.invocResFailed
            );
            expect(hookData).to.equal('post');
        });
    }

    for (const [func, suffix] of TestFunc.error) {
        it('postInvocationHook respects change to context.error' + suffix, async () => {
            loader.getFunction.returns({
                metadata: Binding.queue,
                callback: func,
            });

            testDisposables.push(
                coreApi.registerHook('postInvocation', (context: coreTypes.PostInvocationContext) => {
                    hookData += 'post';
                    expect(context.result).to.be.null;
                    expect(context.error).to.equal(testError);
                    context.error = null;
                    context.result = 'hello';
                })
            );

            sendInvokeMessage([InputData.http]);
            await stream.assertCalledWith(
                Msg.receivedInvocLog(),
                Msg.executingHooksLog(1, 'postInvocation'),
                Msg.executedHooksLog('postInvocation'),
                Msg.invocResponse([], { string: 'hello' })
            );
            expect(hookData).to.equal('post');
        });
    }

    it('pre and post invocation hooks share data', async () => {
        loader.getFunction.returns({
            metadata: Binding.queue,
            callback: async () => {},
        });

        testDisposables.push(
            coreApi.registerHook('preInvocation', (context: coreTypes.PreInvocationContext) => {
                context.hookData['hello'] = 'world';
                hookData += 'pre';
            })
        );

        testDisposables.push(
            coreApi.registerHook('postInvocation', (context: coreTypes.PostInvocationContext) => {
                expect(context.hookData['hello']).to.equal('world');
                hookData += 'post';
            })
        );

        sendInvokeMessage([InputData.http]);
        await stream.assertCalledWith(
            Msg.receivedInvocLog(),
            Msg.executingHooksLog(1, 'preInvocation'),
            Msg.executedHooksLog('preInvocation'),
            Msg.executingHooksLog(1, 'postInvocation'),
            Msg.executedHooksLog('postInvocation'),
            Msg.invocResponse([])
        );
        expect(hookData).to.equal('prepost');
    });

    it('enforces readonly properties in pre and post invocation hooks', async () => {
        loader.getFunction.returns({
            metadata: Binding.queue,
            callback: async () => {},
        });

        testDisposables.push(
            coreApi.registerHook('preInvocation', (context: coreTypes.PreInvocationContext) => {
                context.hookData['hello'] = 'world';
                expect(() => {
                    // @ts-expect-error: setting readonly property
                    context.hookData = {
                        foo: 'bar',
                    };
                }).to.throw(`Cannot assign to read only property 'hookData'`);
                expect(() => {
                    // @ts-expect-error: setting readonly property
                    context.appHookData = {
                        foo: 'bar',
                    };
                }).to.throw(`Cannot assign to read only property 'appHookData'`);
                expect(() => {
                    // @ts-expect-error: setting readonly property
                    context.invocationContext = {
                        foo: 'bar',
                    };
                }).to.throw(`Cannot assign to read only property 'invocationContext'`);
                hookData += 'pre';
            })
        );

        testDisposables.push(
            coreApi.registerHook('postInvocation', (context: coreTypes.PostInvocationContext) => {
                expect(context.hookData['hello']).to.equal('world');
                expect(() => {
                    // @ts-expect-error: setting readonly property
                    context.hookData = {
                        foo: 'bar',
                    };
                }).to.throw(`Cannot assign to read only property 'hookData'`);
                expect(() => {
                    // @ts-expect-error: setting readonly property
                    context.appHookData = {
                        foo: 'bar',
                    };
                }).to.throw(`Cannot assign to read only property 'appHookData'`);
                expect(() => {
                    // @ts-expect-error: setting readonly property
                    context.invocationContext = {
                        foo: 'bar',
                    };
                }).to.throw(`Cannot assign to read only property 'invocationContext'`);
                hookData += 'post';
            })
        );

        sendInvokeMessage([InputData.http]);
        await stream.assertCalledWith(
            Msg.receivedInvocLog(),
            Msg.executingHooksLog(1, 'preInvocation'),
            Msg.executedHooksLog('preInvocation'),
            Msg.executingHooksLog(1, 'postInvocation'),
            Msg.executedHooksLog('postInvocation'),
            Msg.invocResponse([])
        );
        expect(hookData).to.equal('prepost');
    });

    it('appHookData changes from appStart hooks are persisted in invocation hook contexts', async () => {
        const functionAppDirectory = __dirname;
        const expectedAppHookData = {
            hello: 'world',
            test: {
                test2: 3,
            },
        };
        const startFunc = sinon.spy((context: coreTypes.AppStartContext) => {
            Object.assign(context.appHookData, expectedAppHookData);
            hookData += 'appStart';
        });
        testDisposables.push(coreApi.registerHook('appStart', startFunc));

        stream.addTestMessage(WorkerInitMsg.init(functionAppDirectory));

        await stream.assertCalledWith(
            WorkerInitMsg.receivedInitLog,
            WorkerInitMsg.warning('Worker failed to load package.json: file does not exist'),
            AppStartMsg.executingHooksLog(1, 'appStart'),
            AppStartMsg.executedHooksLog('appStart'),
            WorkerInitMsg.response
        );
        expect(startFunc.callCount).to.be.equal(1);

        loader.getFunction.returns({
            metadata: Binding.queue,
            callback: async () => {},
        });

        testDisposables.push(
            coreApi.registerHook('preInvocation', (context: coreTypes.PreInvocationContext) => {
                expect(context.appHookData).to.deep.equal(expectedAppHookData);
                hookData += 'preInvoc';
            })
        );

        testDisposables.push(
            coreApi.registerHook('postInvocation', (context: coreTypes.PostInvocationContext) => {
                expect(context.appHookData).to.deep.equal(expectedAppHookData);
                hookData += 'postInvoc';
            })
        );

        sendInvokeMessage([InputData.http]);
        await stream.assertCalledWith(
            Msg.receivedInvocLog(),
            Msg.executingHooksLog(1, 'preInvocation'),
            Msg.executedHooksLog('preInvocation'),
            Msg.executingHooksLog(1, 'postInvocation'),
            Msg.executedHooksLog('postInvocation'),
            Msg.invocResponse([])
        );
        expect(hookData).to.equal('appStartpreInvocpostInvoc');
    });

    it('appHookData changes from invocation hooks are persisted in app terminate hook contexts', async () => {
        const expectedAppHookData = {
            hello: 'world',
            test: {
                test2: 3,
            },
        };

        loader.getFunction.returns({ callback: async () => {}, metadata: Binding.queue });

        testDisposables.push(
            coreApi.registerHook('preInvocation', (context: coreTypes.PreInvocationContext) => {
                Object.assign(context.appHookData, expectedAppHookData);
                hookData += 'preInvoc';
            })
        );

        testDisposables.push(
            coreApi.registerHook('postInvocation', (context: coreTypes.PostInvocationContext) => {
                expect(context.appHookData).to.deep.equal(expectedAppHookData);
                hookData += 'postInvoc';
            })
        );

        sendInvokeMessage([InputData.http]);
        await stream.assertCalledWith(
            Msg.receivedInvocLog(),
            Msg.executingHooksLog(1, 'preInvocation'),
            Msg.executedHooksLog('preInvocation'),
            Msg.executingHooksLog(1, 'postInvocation'),
            Msg.executedHooksLog('postInvocation'),
            Msg.invocResponse([])
        );

        const terminateFunc = sinon.spy((context: coreTypes.AppTerminateContext) => {
            expect(context.appHookData).to.deep.equal(expectedAppHookData);
            hookData += 'appTerminate';
        });
        testDisposables.push(coreApi.registerHook('appTerminate', terminateFunc));

        stream.addTestMessage(WorkerTerminateMsg.workerTerminate());

        await stream.assertCalledWith(
            WorkerTerminateMsg.receivedWorkerTerminateLog,
            AppStartMsg.executingHooksLog(1, 'appTerminate'),
            AppStartMsg.executedHooksLog('appTerminate')
        );
        expect(terminateFunc.callCount).to.be.equal(1);
        expect(hookData).to.equal('preInvocpostInvocappTerminate');
    });

    it('hookData changes from appStart hooks are not persisted in invocation hook contexts', async () => {
        const functionAppDirectory = __dirname;
        const startFunc = sinon.spy((context: coreTypes.AppStartContext) => {
            Object.assign(context.hookData, {
                hello: 'world',
                test: {
                    test2: 3,
                },
            });
            hookData += 'appStart';
        });
        testDisposables.push(coreApi.registerHook('appStart', startFunc));

        stream.addTestMessage(WorkerInitMsg.init(functionAppDirectory));

        await stream.assertCalledWith(
            WorkerInitMsg.receivedInitLog,
            WorkerInitMsg.warning('Worker failed to load package.json: file does not exist'),
            AppStartMsg.executingHooksLog(1, 'appStart'),
            AppStartMsg.executedHooksLog('appStart'),
            WorkerInitMsg.response
        );
        expect(startFunc.callCount).to.be.equal(1);

        loader.getFunction.returns({
            metadata: Binding.queue,
            callback: async () => {},
        });

        testDisposables.push(
            coreApi.registerHook('preInvocation', (context: coreTypes.PreInvocationContext) => {
                expect(context.hookData).to.be.empty;
                expect(context.appHookData).to.be.empty;
                hookData += 'preInvoc';
            })
        );

        testDisposables.push(
            coreApi.registerHook('postInvocation', (context: coreTypes.PostInvocationContext) => {
                expect(context.hookData).to.be.empty;
                expect(context.appHookData).to.be.empty;
                hookData += 'postInvoc';
            })
        );

        sendInvokeMessage([InputData.http]);
        await stream.assertCalledWith(
            Msg.receivedInvocLog(),
            Msg.executingHooksLog(1, 'preInvocation'),
            Msg.executedHooksLog('preInvocation'),
            Msg.executingHooksLog(1, 'postInvocation'),
            Msg.executedHooksLog('postInvocation'),
            Msg.invocResponse([])
        );

        expect(hookData).to.equal('appStartpreInvocpostInvoc');
    });

    it('hookData changes from invocation hooks are not persisted in app terminate contexts', async () => {
        const expectedAppHookData = {
            hello: 'world',
            test: {
                test2: 3,
            },
        };

        loader.getFunction.returns({ callback: async () => {}, metadata: Binding.queue });

        testDisposables.push(
            coreApi.registerHook('preInvocation', (context: coreTypes.PreInvocationContext) => {
                Object.assign(context.hookData, expectedAppHookData);
                expect(context.appHookData).to.be.empty;
                hookData += 'preInvoc';
            })
        );

        testDisposables.push(
            coreApi.registerHook('postInvocation', (context: coreTypes.PostInvocationContext) => {
                expect(context.hookData).to.deep.equal(expectedAppHookData);
                expect(context.appHookData).to.be.empty;
                hookData += 'postInvoc';
            })
        );

        sendInvokeMessage([InputData.http]);
        await stream.assertCalledWith(
            Msg.receivedInvocLog(),
            Msg.executingHooksLog(1, 'preInvocation'),
            Msg.executedHooksLog('preInvocation'),
            Msg.executingHooksLog(1, 'postInvocation'),
            Msg.executedHooksLog('postInvocation'),
            Msg.invocResponse([])
        );

        const terminateFunc = sinon.spy((context: coreTypes.AppTerminateContext) => {
            expect(context.appHookData).to.be.empty;
            expect(context.hookData).to.be.empty;
            hookData += 'appTerminate';
        });
        testDisposables.push(coreApi.registerHook('appTerminate', terminateFunc));

        stream.addTestMessage(WorkerTerminateMsg.workerTerminate());

        await stream.assertCalledWith(
            WorkerTerminateMsg.receivedWorkerTerminateLog,
            AppStartMsg.executingHooksLog(1, 'appTerminate'),
            AppStartMsg.executedHooksLog('appTerminate')
        );

        expect(terminateFunc.callCount).to.be.equal(1);
        expect(hookData).to.equal('preInvocpostInvocappTerminate');
    });

    it('appHookData changes are persisted between invocation-level hooks', async () => {
        const expectedAppHookData = {
            hello: 'world',
            test: {
                test2: 3,
            },
        };

        loader.getFunction.returns({
            metadata: Binding.queue,
            callback: async () => {},
        });

        testDisposables.push(
            coreApi.registerHook('preInvocation', (context: coreTypes.PreInvocationContext) => {
                Object.assign(context.appHookData, expectedAppHookData);
                hookData += 'pre';
            })
        );

        testDisposables.push(
            coreApi.registerHook('postInvocation', (context: coreTypes.PostInvocationContext) => {
                expect(context.appHookData).to.deep.equal(expectedAppHookData);
                hookData += 'post';
            })
        );

        sendInvokeMessage([InputData.http]);
        await stream.assertCalledWith(
            Msg.receivedInvocLog(),
            Msg.executingHooksLog(1, 'preInvocation'),
            Msg.executedHooksLog('preInvocation'),
            Msg.executingHooksLog(1, 'postInvocation'),
            Msg.executedHooksLog('postInvocation'),
            Msg.invocResponse([])
        );

        expect(hookData).to.equal('prepost');
    });

    it('appHookData changes are persisted across different invocations while hookData changes are not', async () => {
        const expectedAppHookData = {
            hello: 'world',
            test: {
                test2: 3,
            },
        };
        const expectedInvocationHookData = {
            hello2: 'world2',
            test2: {
                test4: 5,
            },
        };

        loader.getFunction.returns({
            metadata: Binding.queue,
            callback: async () => {},
        });

        const pre1 = coreApi.registerHook('preInvocation', (context: coreTypes.PreInvocationContext) => {
            Object.assign(context.appHookData, expectedAppHookData);
            Object.assign(context.hookData, expectedInvocationHookData);
            hookData += 'pre1';
        });
        testDisposables.push(pre1);

        const post1 = coreApi.registerHook('postInvocation', (context: coreTypes.PostInvocationContext) => {
            expect(context.appHookData).to.deep.equal(expectedAppHookData);
            expect(context.hookData).to.deep.equal(expectedInvocationHookData);
            hookData += 'post1';
        });
        testDisposables.push(post1);

        sendInvokeMessage([InputData.http]);
        await stream.assertCalledWith(
            Msg.receivedInvocLog(),
            Msg.executingHooksLog(1, 'preInvocation'),
            Msg.executedHooksLog('preInvocation'),
            Msg.executingHooksLog(1, 'postInvocation'),
            Msg.executedHooksLog('postInvocation'),
            Msg.invocResponse([])
        );
        expect(hookData).to.equal('pre1post1');

        pre1.dispose();
        post1.dispose();

        const pre2 = coreApi.registerHook('preInvocation', (context: coreTypes.PreInvocationContext) => {
            expect(context.appHookData).to.deep.equal(expectedAppHookData);
            expect(context.hookData).to.be.empty;
            hookData += 'pre2';
        });
        testDisposables.push(pre2);

        const post2 = coreApi.registerHook('postInvocation', (context: coreTypes.PostInvocationContext) => {
            expect(context.appHookData).to.deep.equal(expectedAppHookData);
            expect(context.hookData).to.be.empty;
            hookData += 'post2';
        });
        testDisposables.push(post2);

        sendInvokeMessage([InputData.http]);
        await stream.assertCalledWith(
            Msg.receivedInvocLog(),
            Msg.executingHooksLog(1, 'preInvocation'),
            Msg.executedHooksLog('preInvocation'),
            Msg.executingHooksLog(1, 'postInvocation'),
            Msg.executedHooksLog('postInvocation'),
            Msg.invocResponse([])
        );

        expect(hookData).to.equal('pre1post1pre2post2');
    });

    it('dispose hooks', async () => {
        loader.getFunction.returns({
            metadata: Binding.queue,
            callback: async () => {},
        });

        const disposableA: coreTypes.Disposable = coreApi.registerHook('preInvocation', () => {
            hookData += 'a';
        });
        testDisposables.push(disposableA);
        const disposableB: coreTypes.Disposable = coreApi.registerHook('preInvocation', () => {
            hookData += 'b';
        });
        testDisposables.push(disposableB);

        sendInvokeMessage([InputData.http]);
        await stream.assertCalledWith(
            Msg.receivedInvocLog(),
            Msg.executingHooksLog(2, 'preInvocation'),
            Msg.executedHooksLog('preInvocation'),
            Msg.invocResponse([])
        );
        expect(hookData).to.equal('ab');

        disposableA.dispose();
        sendInvokeMessage([InputData.http]);
        await stream.assertCalledWith(
            Msg.receivedInvocLog(),
            Msg.executingHooksLog(1, 'preInvocation'),
            Msg.executedHooksLog('preInvocation'),
            Msg.invocResponse([])
        );
        expect(hookData).to.equal('abb');

        disposableB.dispose();
        sendInvokeMessage([InputData.http]);
        await stream.assertCalledWith(Msg.receivedInvocLog(), Msg.invocResponse([]));
        expect(hookData).to.equal('abb');
    });

    for (const [func, suffix] of TestFunc.returnEmptyString) {
        it('returns and serializes falsy value in Durable: ""' + suffix, async () => {
            loader.getFunction.returns({
                metadata: Binding.activity,
                callback: func,
            });
            sendInvokeMessage([]);
            const expectedReturnValue = { string: '' };
            await stream.assertCalledWith(Msg.receivedInvocLog(), Msg.invocResponse([], expectedReturnValue));
        });
    }

    for (const [func, suffix] of TestFunc.returnZero) {
        it('returns and serializes falsy value in Durable: 0' + suffix, async () => {
            loader.getFunction.returns({
                metadata: Binding.activity,
                callback: func,
            });
            sendInvokeMessage([]);
            const expectedReturnValue = { int: 0 };
            await stream.assertCalledWith(Msg.receivedInvocLog(), Msg.invocResponse([], expectedReturnValue));
        });
    }

    for (const [func, suffix] of TestFunc.returnFalse) {
        it('returns and serializes falsy value in Durable: false' + suffix, async () => {
            loader.getFunction.returns({
                metadata: Binding.activity,
                callback: func,
            });
            sendInvokeMessage([]);
            const expectedReturnValue = { json: 'false' };
            await stream.assertCalledWith(Msg.receivedInvocLog(), Msg.invocResponse([], expectedReturnValue));
        });
    }
});
