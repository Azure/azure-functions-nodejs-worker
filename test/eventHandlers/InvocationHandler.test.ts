// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

/* eslint-disable deprecation/deprecation */

import 'mocha';
import { AzureFunction, Context } from '@azure/functions';
import * as coreTypes from '@azure/functions-core';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { worker } from '../../src/WorkerContext';
import { beforeEventHandlerSuite } from './beforeEventHandlerSuite';
import { msg } from './msg';
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

describe('InvocationHandler', () => {
    let stream: TestEventStream;
    let coreApi: typeof coreTypes;
    let processExitStub: sinon.SinonStub;

    before(async () => {
        stream = beforeEventHandlerSuite();
        coreApi = await import('@azure/functions-core');
        processExitStub = sinon.stub(process, 'exit');
    });

    beforeEach(async () => {
        hookData = '';
    });

    afterEach(async () => {
        await stream.afterEachEventHandlerTest();
    });

    after(() => {
        processExitStub.restore();
    });

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

    function registerV3Func(metadata: rpc.IRpcFunctionMetadata, callback: AzureFunction): void {
        worker.app.legacyFunctions.testFuncId = {
            metadata,
            callback: <coreTypes.FunctionCallback>callback,
            thisArg: undefined,
        };
    }

    for (const [func, suffix] of TestFunc.basic) {
        it('invokes function' + suffix, async () => {
            registerV3Func(Binding.httpRes, func);
            stream.addTestMessage(msg.invocation.request([InputData.http]));
            await stream.assertCalledWith(
                msg.invocation.receivedRequestLog,
                msg.invocation.userLog(),
                msg.invocation.response([getHttpResponse()])
            );
        });
    }

    for (const [func, suffix] of TestFunc.returnHttp) {
        it('returns correct data with $return binding' + suffix, async () => {
            registerV3Func(Binding.httpReturn, func);
            stream.addTestMessage(msg.invocation.request([InputData.http]));
            const expectedOutput = getHttpResponse(undefined, '$return');
            const expectedReturnValue = {
                http: {
                    body: { json: '{"hello":"world"}' },
                    cookies: [],
                    headers: {},
                    statusCode: null,
                },
            };
            await stream.assertCalledWith(
                msg.invocation.receivedRequestLog,
                msg.invocation.response([expectedOutput], expectedReturnValue)
            );
        });
    }

    for (const [func, suffix] of TestFunc.returnArray) {
        it('returns returned output if not http' + suffix, async () => {
            registerV3Func(Binding.queue, func);
            stream.addTestMessage(msg.invocation.request([]));
            const expectedReturnValue = {
                json: '["hello, seattle!","hello, tokyo!"]',
            };
            await stream.assertCalledWith(
                msg.invocation.receivedRequestLog,
                msg.invocation.response([], expectedReturnValue)
            );
        });
    }

    for (const [func, suffix] of TestFunc.returnArray) {
        it('returned output is ignored if http' + suffix, async () => {
            registerV3Func(Binding.httpRes, func);
            stream.addTestMessage(msg.invocation.request([]));
            await stream.assertCalledWith(msg.invocation.receivedRequestLog, msg.invocation.response([], undefined));
        });
    }

    for (const [func, suffix] of TestFunc.resHttp) {
        it('serializes output binding data through context.done' + suffix, async () => {
            registerV3Func(Binding.httpRes, func);
            stream.addTestMessage(msg.invocation.request([InputData.http]));
            const expectedOutput = [getHttpResponse({ hello: 'world' })];
            await stream.assertCalledWith(msg.invocation.receivedRequestLog, msg.invocation.response(expectedOutput));
        });
    }

    for (const [func, suffix] of TestFunc.multipleBindings) {
        it('serializes multiple output bindings through context.done and context.bindings' + suffix, async () => {
            registerV3Func(
                {
                    bindings: {
                        req: Binding.httpInput,
                        res: Binding.httpOutput,
                        queueOutput: Binding.queueOutput,
                        overriddenQueueOutput: Binding.queueOutput,
                    },
                    name: 'testFuncName',
                },
                func
            );
            stream.addTestMessage(msg.invocation.request([InputData.http]));
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
            await stream.assertCalledWith(msg.invocation.receivedRequestLog, msg.invocation.response(expectedOutput));
        });
    }

    for (const [func, suffix] of TestFunc.error) {
        it('returns failed status for user error' + suffix, async () => {
            registerV3Func(Binding.queue, func);
            stream.addTestMessage(msg.invocation.request([InputData.http]));
            await stream.assertCalledWith(msg.invocation.receivedRequestLog, msg.invocation.failedResponse());
        });
    }

    it('throws for malformed messages', () => {
        expect(() => {
            stream.write(<any>{
                functionLoadResponse: 1,
            });
        }).to.throw('functionLoadResponse.object expected');
    });

    it('throws for unloaded function', async () => {
        const errorMessage = "Function code for 'testFuncId' is not loaded and cannot be invoked.";
        stream.addTestMessage(msg.invocation.request());
        await stream.assertCalledWith(
            { rpcLog: { level: LogLevel.Error, logCategory: LogCategory.System, message: errorMessage } },
            msg.invocation.failedResponse(errorMessage)
        );
    });

    it('empty function does not return invocation response', async () => {
        registerV3Func(Binding.httpRes, () => {});
        stream.addTestMessage(msg.invocation.request([InputData.http]));
        await stream.assertCalledWith(msg.invocation.receivedRequestLog);
    });

    it('logs error on calling context.done in async function', async () => {
        registerV3Func(Binding.httpRes, async (context: Context) => {
            context.done();
        });
        stream.addTestMessage(msg.invocation.request([InputData.http]));
        await stream.assertCalledWith(
            msg.invocation.receivedRequestLog,
            msg.invocation.asyncAndDoneError,
            msg.invocation.response([getHttpResponse()])
        );
    });

    it('logs error on calling context.done more than once', async () => {
        registerV3Func(Binding.httpRes, (context: Context) => {
            context.done();
            context.done();
        });
        stream.addTestMessage(msg.invocation.request([InputData.http]));
        await stream.assertCalledWith(
            msg.invocation.receivedRequestLog,
            msg.invocation.duplicateDoneError,
            msg.invocation.response([getHttpResponse()])
        );
    });

    it('logs error on calling context.log after context.done', async () => {
        registerV3Func(Binding.httpRes, (context: Context) => {
            context.done();
            context.log('testUserLog');
        });
        stream.addTestMessage(msg.invocation.request([InputData.http]));
        await stream.assertCalledWith(
            msg.invocation.receivedRequestLog,
            msg.invocation.unexpectedLogAfterDoneLog,
            msg.invocation.userLog(),
            msg.invocation.response([getHttpResponse()])
        );
    });

    it('logs error on calling context.log after async function', async () => {
        let _context: Context;
        registerV3Func(Binding.httpRes, async (context: Context) => {
            _context = context;
            return 'hello';
        });
        stream.addTestMessage(msg.invocation.request([InputData.http]));
        // wait for first two messages to ensure invocation happens
        await stream.assertCalledWith(msg.invocation.receivedRequestLog, msg.invocation.response([getHttpResponse()]));
        // then add extra context.log
        _context!.log('testUserLog');
        await stream.assertCalledWith(msg.invocation.unexpectedLogAfterDoneLog, msg.invocation.userLog());
    });

    for (const [func, suffix] of TestFunc.logHookData) {
        it('preInvocationHook' + suffix, async () => {
            registerV3Func(Binding.queue, func);

            coreApi.registerHook('preInvocation', () => {
                hookData += 'pre';
            });

            stream.addTestMessage(msg.invocation.request([InputData.http]));
            await stream.assertCalledWith(
                msg.invocation.receivedRequestLog,
                msg.invocation.executingHooksLog(1, 'preInvocation'),
                msg.invocation.executedHooksLog('preInvocation'),
                msg.invocation.userLog('preinvoc'),
                msg.invocation.response([], { string: 'hello' })
            );
            expect(hookData).to.equal('preinvoc');
        });
    }

    for (const [func, suffix] of TestFunc.logInput) {
        it('preInvocationHook respects change to inputs' + suffix, async () => {
            registerV3Func(Binding.queue, func);

            coreApi.registerHook('preInvocation', (context: coreTypes.PreInvocationContext) => {
                expect(context.inputs.length).to.equal(1);
                expect(context.inputs[0]).to.equal('testStringData');
                context.inputs = ['changedStringData'];
            });

            stream.addTestMessage(msg.invocation.request([InputData.string]));
            await stream.assertCalledWith(
                msg.invocation.receivedRequestLog,
                msg.invocation.executingHooksLog(1, 'preInvocation'),
                msg.invocation.executedHooksLog('preInvocation'),
                msg.invocation.userLog('changedStringData'),
                msg.invocation.response([])
            );
        });
    }

    it('preInvocationHook respects change to functionCallback', async () => {
        registerV3Func(Binding.queue, async (invocContext: Context) => {
            invocContext.log('old function');
        });

        coreApi.registerHook('preInvocation', (context: coreTypes.PreInvocationContext) => {
            expect(context.functionCallback).to.be.a('function');
            context.functionCallback = <coreTypes.FunctionCallback>(async (invocContext: Context) => {
                invocContext.log('new function');
            });
        });

        stream.addTestMessage(msg.invocation.request([InputData.string]));
        await stream.assertCalledWith(
            msg.invocation.receivedRequestLog,
            msg.invocation.executingHooksLog(1, 'preInvocation'),
            msg.invocation.executedHooksLog('preInvocation'),
            msg.invocation.userLog('new function'),
            msg.invocation.response([])
        );
    });

    for (const [func, suffix] of TestFunc.logHookData) {
        it('postInvocationHook' + suffix, async () => {
            registerV3Func(Binding.queue, func);

            coreApi.registerHook('postInvocation', (context: coreTypes.PostInvocationContext) => {
                hookData += 'post';
                expect(context.result).to.equal('hello');
                expect(context.error).to.be.null;
                (<Context>context.invocationContext).log('hello from post');
            });

            stream.addTestMessage(msg.invocation.request([InputData.http]));
            await stream.assertCalledWith(
                msg.invocation.receivedRequestLog,
                msg.invocation.userLog('invoc'),
                msg.invocation.executingHooksLog(1, 'postInvocation'),
                msg.invocation.userLog('hello from post'),
                msg.invocation.executedHooksLog('postInvocation'),
                msg.invocation.response([], { string: 'hello' })
            );
            expect(hookData).to.equal('invocpost');
        });
    }

    for (const [func, suffix] of TestFunc.logHookData) {
        it('postInvocationHook respects change to context.result' + suffix, async () => {
            registerV3Func(Binding.queue, func);

            coreApi.registerHook('postInvocation', (context: coreTypes.PostInvocationContext) => {
                hookData += 'post';
                expect(context.result).to.equal('hello');
                expect(context.error).to.be.null;
                context.result = 'world';
            });

            stream.addTestMessage(msg.invocation.request([InputData.http]));
            await stream.assertCalledWith(
                msg.invocation.receivedRequestLog,
                msg.invocation.userLog('invoc'),
                msg.invocation.executingHooksLog(1, 'postInvocation'),
                msg.invocation.executedHooksLog('postInvocation'),
                msg.invocation.response([], { string: 'world' })
            );
            expect(hookData).to.equal('invocpost');
        });
    }

    for (const [func, suffix] of TestFunc.error) {
        it('postInvocationHook executes if function throws error' + suffix, async () => {
            registerV3Func(Binding.queue, func);

            coreApi.registerHook('postInvocation', (context: coreTypes.PostInvocationContext) => {
                hookData += 'post';
                expect(context.result).to.be.null;
                expect(context.error).to.equal(testError);
            });

            stream.addTestMessage(msg.invocation.request([InputData.http]));
            await stream.assertCalledWith(
                msg.invocation.receivedRequestLog,
                msg.invocation.executingHooksLog(1, 'postInvocation'),
                msg.invocation.executedHooksLog('postInvocation'),
                msg.invocation.failedResponse()
            );
            expect(hookData).to.equal('post');
        });
    }

    for (const [func, suffix] of TestFunc.error) {
        it('postInvocationHook respects change to context.error' + suffix, async () => {
            registerV3Func(Binding.queue, func);

            coreApi.registerHook('postInvocation', (context: coreTypes.PostInvocationContext) => {
                hookData += 'post';
                expect(context.result).to.be.null;
                expect(context.error).to.equal(testError);
                context.error = null;
                context.result = 'hello';
            });

            stream.addTestMessage(msg.invocation.request([InputData.http]));
            await stream.assertCalledWith(
                msg.invocation.receivedRequestLog,
                msg.invocation.executingHooksLog(1, 'postInvocation'),
                msg.invocation.executedHooksLog('postInvocation'),
                msg.invocation.response([], { string: 'hello' })
            );
            expect(hookData).to.equal('post');
        });
    }

    it('pre and post invocation hooks share data', async () => {
        registerV3Func(Binding.queue, async () => {});

        coreApi.registerHook('preInvocation', (context: coreTypes.PreInvocationContext) => {
            context.hookData['hello'] = 'world';
            hookData += 'pre';
        });

        coreApi.registerHook('postInvocation', (context: coreTypes.PostInvocationContext) => {
            expect(context.hookData['hello']).to.equal('world');
            hookData += 'post';
        });

        stream.addTestMessage(msg.invocation.request([InputData.http]));
        await stream.assertCalledWith(
            msg.invocation.receivedRequestLog,
            msg.invocation.executingHooksLog(1, 'preInvocation'),
            msg.invocation.executedHooksLog('preInvocation'),
            msg.invocation.executingHooksLog(1, 'postInvocation'),
            msg.invocation.executedHooksLog('postInvocation'),
            msg.invocation.response([])
        );
        expect(hookData).to.equal('prepost');
    });

    it('enforces readonly properties in pre and post invocation hooks', async () => {
        registerV3Func(Binding.queue, async () => {});

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
        });

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
        });

        stream.addTestMessage(msg.invocation.request([InputData.http]));
        await stream.assertCalledWith(
            msg.invocation.receivedRequestLog,
            msg.invocation.executingHooksLog(1, 'preInvocation'),
            msg.invocation.executedHooksLog('preInvocation'),
            msg.invocation.executingHooksLog(1, 'postInvocation'),
            msg.invocation.executedHooksLog('postInvocation'),
            msg.invocation.response([])
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
        coreApi.registerHook('appStart', startFunc);

        stream.addTestMessage(msg.init.request(functionAppDirectory));

        await stream.assertCalledWith(
            msg.init.receivedRequestLog,
            msg.noPackageJsonWarning,
            msg.executingAppHooksLog(1, 'appStart'),
            msg.executedAppHooksLog('appStart'),
            msg.init.response
        );
        expect(startFunc.callCount).to.be.equal(1);

        registerV3Func(Binding.queue, async () => {});

        coreApi.registerHook('preInvocation', (context: coreTypes.PreInvocationContext) => {
            expect(context.appHookData).to.deep.equal(expectedAppHookData);
            hookData += 'preInvoc';
        });

        coreApi.registerHook('postInvocation', (context: coreTypes.PostInvocationContext) => {
            expect(context.appHookData).to.deep.equal(expectedAppHookData);
            hookData += 'postInvoc';
        });

        stream.addTestMessage(msg.invocation.request([InputData.http]));
        await stream.assertCalledWith(
            msg.invocation.receivedRequestLog,
            msg.invocation.executingHooksLog(1, 'preInvocation'),
            msg.invocation.executedHooksLog('preInvocation'),
            msg.invocation.executingHooksLog(1, 'postInvocation'),
            msg.invocation.executedHooksLog('postInvocation'),
            msg.invocation.response([])
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

        registerV3Func(Binding.queue, async () => {});
        coreApi.registerHook('preInvocation', (context: coreTypes.PreInvocationContext) => {
            Object.assign(context.appHookData, expectedAppHookData);
            hookData += 'preInvoc';
        });

        coreApi.registerHook('postInvocation', (context: coreTypes.PostInvocationContext) => {
            expect(context.appHookData).to.deep.equal(expectedAppHookData);
            hookData += 'postInvoc';
        });

        stream.addTestMessage(msg.invocation.request([InputData.http]));
        await stream.assertCalledWith(
            msg.invocation.receivedRequestLog,
            msg.invocation.executingHooksLog(1, 'preInvocation'),
            msg.invocation.executedHooksLog('preInvocation'),
            msg.invocation.executingHooksLog(1, 'postInvocation'),
            msg.invocation.executedHooksLog('postInvocation'),
            msg.invocation.response([])
        );

        const terminateFunc = sinon.spy((context: coreTypes.AppTerminateContext) => {
            expect(context.appHookData).to.deep.equal(expectedAppHookData);
            hookData += 'appTerminate';
        });
        coreApi.registerHook('appTerminate', terminateFunc);

        stream.addTestMessage(msg.terminate.request());

        await stream.assertCalledWith(
            msg.terminate.receivedWorkerTerminateLog,
            msg.executingAppHooksLog(1, 'appTerminate'),
            msg.executedAppHooksLog('appTerminate')
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
        coreApi.registerHook('appStart', startFunc);

        stream.addTestMessage(msg.init.request(functionAppDirectory));

        await stream.assertCalledWith(
            msg.init.receivedRequestLog,
            msg.noPackageJsonWarning,
            msg.executingAppHooksLog(1, 'appStart'),
            msg.executedAppHooksLog('appStart'),
            msg.init.response
        );
        expect(startFunc.callCount).to.be.equal(1);

        registerV3Func(Binding.queue, async () => {});

        coreApi.registerHook('preInvocation', (context: coreTypes.PreInvocationContext) => {
            expect(context.hookData).to.be.empty;
            expect(context.appHookData).to.be.empty;
            hookData += 'preInvoc';
        });

        coreApi.registerHook('postInvocation', (context: coreTypes.PostInvocationContext) => {
            expect(context.hookData).to.be.empty;
            expect(context.appHookData).to.be.empty;
            hookData += 'postInvoc';
        });

        stream.addTestMessage(msg.invocation.request([InputData.http]));
        await stream.assertCalledWith(
            msg.invocation.receivedRequestLog,
            msg.invocation.executingHooksLog(1, 'preInvocation'),
            msg.invocation.executedHooksLog('preInvocation'),
            msg.invocation.executingHooksLog(1, 'postInvocation'),
            msg.invocation.executedHooksLog('postInvocation'),
            msg.invocation.response([])
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

        registerV3Func(Binding.queue, async () => {});
        coreApi.registerHook('preInvocation', (context: coreTypes.PreInvocationContext) => {
            Object.assign(context.hookData, expectedAppHookData);
            expect(context.appHookData).to.be.empty;
            hookData += 'preInvoc';
        });

        coreApi.registerHook('postInvocation', (context: coreTypes.PostInvocationContext) => {
            expect(context.hookData).to.deep.equal(expectedAppHookData);
            expect(context.appHookData).to.be.empty;
            hookData += 'postInvoc';
        });

        stream.addTestMessage(msg.invocation.request([InputData.http]));
        await stream.assertCalledWith(
            msg.invocation.receivedRequestLog,
            msg.invocation.executingHooksLog(1, 'preInvocation'),
            msg.invocation.executedHooksLog('preInvocation'),
            msg.invocation.executingHooksLog(1, 'postInvocation'),
            msg.invocation.executedHooksLog('postInvocation'),
            msg.invocation.response([])
        );

        const terminateFunc = sinon.spy((context: coreTypes.AppTerminateContext) => {
            expect(context.appHookData).to.be.empty;
            expect(context.hookData).to.be.empty;
            hookData += 'appTerminate';
        });
        coreApi.registerHook('appTerminate', terminateFunc);

        stream.addTestMessage(msg.terminate.request());

        await stream.assertCalledWith(
            msg.terminate.receivedWorkerTerminateLog,
            msg.executingAppHooksLog(1, 'appTerminate'),
            msg.executedAppHooksLog('appTerminate')
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

        registerV3Func(Binding.queue, async () => {});

        coreApi.registerHook('preInvocation', (context: coreTypes.PreInvocationContext) => {
            Object.assign(context.appHookData, expectedAppHookData);
            hookData += 'pre';
        });

        coreApi.registerHook('postInvocation', (context: coreTypes.PostInvocationContext) => {
            expect(context.appHookData).to.deep.equal(expectedAppHookData);
            hookData += 'post';
        });

        stream.addTestMessage(msg.invocation.request([InputData.http]));
        await stream.assertCalledWith(
            msg.invocation.receivedRequestLog,
            msg.invocation.executingHooksLog(1, 'preInvocation'),
            msg.invocation.executedHooksLog('preInvocation'),
            msg.invocation.executingHooksLog(1, 'postInvocation'),
            msg.invocation.executedHooksLog('postInvocation'),
            msg.invocation.response([])
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

        registerV3Func(Binding.queue, async () => {});

        const pre1 = coreApi.registerHook('preInvocation', (context: coreTypes.PreInvocationContext) => {
            Object.assign(context.appHookData, expectedAppHookData);
            Object.assign(context.hookData, expectedInvocationHookData);
            hookData += 'pre1';
        });

        const post1 = coreApi.registerHook('postInvocation', (context: coreTypes.PostInvocationContext) => {
            expect(context.appHookData).to.deep.equal(expectedAppHookData);
            expect(context.hookData).to.deep.equal(expectedInvocationHookData);
            hookData += 'post1';
        });

        stream.addTestMessage(msg.invocation.request([InputData.http]));
        await stream.assertCalledWith(
            msg.invocation.receivedRequestLog,
            msg.invocation.executingHooksLog(1, 'preInvocation'),
            msg.invocation.executedHooksLog('preInvocation'),
            msg.invocation.executingHooksLog(1, 'postInvocation'),
            msg.invocation.executedHooksLog('postInvocation'),
            msg.invocation.response([])
        );
        expect(hookData).to.equal('pre1post1');

        pre1.dispose();
        post1.dispose();

        coreApi.registerHook('preInvocation', (context: coreTypes.PreInvocationContext) => {
            expect(context.appHookData).to.deep.equal(expectedAppHookData);
            expect(context.hookData).to.be.empty;
            hookData += 'pre2';
        });

        coreApi.registerHook('postInvocation', (context: coreTypes.PostInvocationContext) => {
            expect(context.appHookData).to.deep.equal(expectedAppHookData);
            expect(context.hookData).to.be.empty;
            hookData += 'post2';
        });

        stream.addTestMessage(msg.invocation.request([InputData.http]));
        await stream.assertCalledWith(
            msg.invocation.receivedRequestLog,
            msg.invocation.executingHooksLog(1, 'preInvocation'),
            msg.invocation.executedHooksLog('preInvocation'),
            msg.invocation.executingHooksLog(1, 'postInvocation'),
            msg.invocation.executedHooksLog('postInvocation'),
            msg.invocation.response([])
        );

        expect(hookData).to.equal('pre1post1pre2post2');
    });

    it('dispose hooks', async () => {
        registerV3Func(Binding.queue, async () => {});

        const disposableA: coreTypes.Disposable = coreApi.registerHook('preInvocation', () => {
            hookData += 'a';
        });
        const disposableB: coreTypes.Disposable = coreApi.registerHook('preInvocation', () => {
            hookData += 'b';
        });

        stream.addTestMessage(msg.invocation.request([InputData.http]));
        await stream.assertCalledWith(
            msg.invocation.receivedRequestLog,
            msg.invocation.executingHooksLog(2, 'preInvocation'),
            msg.invocation.executedHooksLog('preInvocation'),
            msg.invocation.response([])
        );
        expect(hookData).to.equal('ab');

        disposableA.dispose();
        stream.addTestMessage(msg.invocation.request([InputData.http]));
        await stream.assertCalledWith(
            msg.invocation.receivedRequestLog,
            msg.invocation.executingHooksLog(1, 'preInvocation'),
            msg.invocation.executedHooksLog('preInvocation'),
            msg.invocation.response([])
        );
        expect(hookData).to.equal('abb');

        disposableB.dispose();
        stream.addTestMessage(msg.invocation.request([InputData.http]));
        await stream.assertCalledWith(msg.invocation.receivedRequestLog, msg.invocation.response([]));
        expect(hookData).to.equal('abb');
    });

    for (const [func, suffix] of TestFunc.returnEmptyString) {
        it('returns and serializes falsy value in Durable: ""' + suffix, async () => {
            registerV3Func(Binding.activity, func);
            stream.addTestMessage(msg.invocation.request([]));
            const expectedReturnValue = { string: '' };
            await stream.assertCalledWith(
                msg.invocation.receivedRequestLog,
                msg.invocation.response([], expectedReturnValue)
            );
        });
    }

    for (const [func, suffix] of TestFunc.returnZero) {
        it('returns and serializes falsy value in Durable: 0' + suffix, async () => {
            registerV3Func(Binding.activity, func);
            stream.addTestMessage(msg.invocation.request([]));
            const expectedReturnValue = { int: 0 };
            await stream.assertCalledWith(
                msg.invocation.receivedRequestLog,
                msg.invocation.response([], expectedReturnValue)
            );
        });
    }

    for (const [func, suffix] of TestFunc.returnFalse) {
        it('returns and serializes falsy value in Durable: false' + suffix, async () => {
            registerV3Func(Binding.activity, func);
            stream.addTestMessage(msg.invocation.request([]));
            const expectedReturnValue = { json: 'false' };
            await stream.assertCalledWith(
                msg.invocation.receivedRequestLog,
                msg.invocation.response([], expectedReturnValue)
            );
        });
    }

    it("allows use of 'this' in loaded user function", async () => {
        stream.addTestMessage(msg.funcLoad.request('moduleWithThis.js', { entryPoint: 'test' }));
        await stream.assertCalledWith(msg.funcLoad.receivedRequestLog, msg.funcLoad.response);
        stream.addTestMessage(msg.invocation.request([]));
        await stream.assertCalledWith(
            msg.invocation.receivedRequestLog,
            msg.invocation.userLog('This value: "testThisProp"'),
            msg.invocation.response([])
        );
    });

    it('log hook respects changes to value, only for user log', async () => {
        coreApi.registerHook('log', (ctx) => {
            ctx.message += 'UpdatedFromHook';
            ctx.level = 'error';
        });

        registerV3Func(Binding.queue, async (invocContext: Context) => {
            invocContext.log('testUserLog');
        });
        stream.addTestMessage(msg.invocation.request([InputData.http]));
        await stream.assertCalledWith(
            msg.invocation.receivedRequestLog,
            msg.invocation.userLog('testUserLogUpdatedFromHook', LogLevel.Error),
            msg.invocation.response([])
        );
    });

    it('ignores log hook error', async () => {
        coreApi.registerHook('log', (_ctx) => {
            throw new Error('failed log hook');
        });

        registerV3Func(Binding.queue, async (invocContext: Context) => {
            invocContext.log('testUserLog');
        });
        stream.addTestMessage(msg.invocation.request([InputData.http]));
        await stream.assertCalledWith(
            msg.invocation.receivedRequestLog,
            msg.invocation.userLog(),
            msg.invocation.response([])
        );
    });
});
