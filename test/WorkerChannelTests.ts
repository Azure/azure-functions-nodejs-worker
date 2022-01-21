// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import 'mocha';
import * as sinon from 'sinon';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { FunctionInfo } from '../src/FunctionInfo';
import { FunctionLoader } from '../src/FunctionLoader';
import { WorkerChannel } from '../src/WorkerChannel';
import { TestEventStream } from './TestEventStream';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

describe('WorkerChannel', () => {
    let channel: WorkerChannel;
    let stream: TestEventStream;
    let loader: sinon.SinonStubbedInstance<FunctionLoader>;
    let functions;

    const sendInvokeMessage = (
        inputData?: rpc.IParameterBinding[] | null,
        triggerDataMock?: { [k: string]: rpc.ITypedData } | null
    ): rpc.IInvocationRequest => {
        const actualInvocationRequest: rpc.IInvocationRequest = <rpc.IInvocationRequest>{
            functionId: 'id',
            invocationId: '1',
            inputData: inputData,
            triggerMetadata: triggerDataMock,
        };

        stream.addTestMessage({
            invocationRequest: actualInvocationRequest,
        });

        return actualInvocationRequest;
    };

    const assertInvocationSuccess = (
        expectedOutputData?: rpc.IParameterBinding[] | null,
        expectedReturnValue?: rpc.ITypedData | null
    ) => {
        sinon.assert.calledWithMatch(stream.written, <rpc.IStreamingMessage>{
            invocationResponse: {
                invocationId: '1',
                result: {
                    status: rpc.StatusResult.Status.Success,
                },
                outputData: expectedOutputData,
                returnValue: expectedReturnValue,
            },
        });
    };

    const getHttpTriggerDataMock: () => { [k: string]: rpc.ITypedData } = () => {
        return {
            Headers: {
                json: JSON.stringify({ Connection: 'Keep-Alive' }),
            },
            Sys: {
                json: JSON.stringify({ MethodName: 'test-js', UtcNow: '2018', RandGuid: '3212' }),
            },
        };
    };
    const httpInputData = {
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
    const orchestrationTriggerBinding = {
        type: 'orchestrationtrigger',
        direction: 1,
        dataType: 1,
    };
    const activityTriggerBinding = {
        type: 'activityTrigger',
        direction: 1,
        dataType: 1,
    };
    const httpInputBinding = {
        type: 'httpTrigger',
        direction: 0,
        dataType: 1,
    };
    const httpOutputBinding = {
        type: 'http',
        direction: 1,
        dataType: 1,
    };
    const queueOutputBinding = {
        type: 'queue',
        direction: 1,
        dataType: 1,
    };
    const httpReturnBinding = {
        bindings: {
            req: httpInputBinding,
            $return: httpOutputBinding,
        },
    };
    const httpResBinding = {
        bindings: {
            req: httpInputBinding,
            res: httpOutputBinding,
        },
    };
    const multipleBinding = {
        bindings: {
            req: httpInputBinding,
            res: httpOutputBinding,
            queueOutput: queueOutputBinding,
            overriddenQueueOutput: queueOutputBinding,
        },
    };
    const orchestratorBinding = {
        bindings: {
            test: orchestrationTriggerBinding,
        },
    };
    const activityBinding = {
        bindings: {
            name: activityTriggerBinding,
        },
    };
    const queueTriggerBinding = {
        bindings: {
            test: {
                type: 'queue',
                direction: 1,
                dataType: 1,
            },
        },
    };

    beforeEach(() => {
        stream = new TestEventStream();
        loader = sinon.createStubInstance<FunctionLoader>(FunctionLoader);
        channel = new WorkerChannel('workerId', stream, loader);
    });

    it('responds to init', () => {
        const initMessage = {
            requestId: 'id',
            workerInitRequest: {
                capabilities: {},
            },
        };

        const expectedOutput = {
            requestId: 'id',
            workerInitResponse: {
                capabilities: {
                    RpcHttpBodyOnly: 'true',
                    RpcHttpTriggerMetadataRemoved: 'true',
                    IgnoreEmptyValuedRpcHttpHeaders: 'true',
                    UseNullableValueDictionaryForHttp: 'true',
                },
                result: {
                    status: rpc.StatusResult.Status.Success,
                },
            },
        };

        expectedOutput.workerInitResponse.capabilities['TypedDataCollection'] = 'true';

        stream.addTestMessage(initMessage);
        sinon.assert.calledWith(stream.written);
    });

    it('does not init for Node.js v8.x and v2 compatability = false', () => {
        const version = process.version;
        if (version.split('.')[0] === 'v8') {
            const initMessage = {
                requestId: 'id',
                workerInitRequest: {
                    capabilities: {},
                },
            };

            expect(() => stream.addTestMessage(initMessage)).to.throw(
                `Incompatible Node.js version (${process.version}). The version of the Azure Functions runtime you are using (v3) supports Node.js v10.x and v12.x. Refer to our documentation to see the Node.js versions supported by each version of Azure Functions: https://aka.ms/functions-node-versions`
            );
        }
    });

    it('responds to function load', async () => {
        stream.addTestMessage({
            requestId: 'id',
            functionLoadRequest: {
                functionId: 'funcId',
                metadata: {},
            },
        });
        // Set slight delay
        await new Promise((resolve) => setTimeout(resolve, 100));
        sinon.assert.calledWith(stream.written, <rpc.IStreamingMessage>{
            requestId: 'id',
            functionLoadResponse: {
                functionId: 'funcId',
                result: {
                    status: rpc.StatusResult.Status.Success,
                },
            },
        });
    });

    it('handles function load exception', () => {
        const err = new Error('Function throws error');
        err.stack = '<STACKTRACE>';

        loader.load = sinon.stub().throws(err);
        channel = new WorkerChannel('workerId', stream, loader);
        stream.addTestMessage({
            requestId: 'id',
            functionLoadRequest: {
                functionId: 'funcId',
                metadata: {},
            },
        });
        sinon.assert.calledWith(stream.written, <rpc.IStreamingMessage>{
            requestId: 'id',
            functionLoadResponse: {
                functionId: 'funcId',
                result: {
                    status: rpc.StatusResult.Status.Failure,
                    exception: {
                        message: "Worker was unable to load function undefined: 'Error: Function throws error'",
                        stackTrace: '<STACKTRACE>',
                    },
                },
            },
        });
    });

    it('reloads environment variables', () => {
        process.env.PlaceholderVariable = 'TRUE';
        stream.addTestMessage({
            requestId: 'id',
            functionEnvironmentReloadRequest: {
                environmentVariables: {
                    hello: 'world',
                    SystemDrive: 'Q:',
                },
                functionAppDirectory: null,
            },
        });
        sinon.assert.calledWith(stream.written, <rpc.IStreamingMessage>{
            requestId: 'id',
            functionEnvironmentReloadResponse: {
                result: {
                    status: rpc.StatusResult.Status.Success,
                },
            },
        });
        expect(process.env.hello).to.equal('world');
        expect(process.env.SystemDrive).to.equal('Q:');
        expect(process.env.PlaceholderVariable).to.be.undefined;
    });

    it('reloading environment variables removes existing environment variables', () => {
        process.env.PlaceholderVariable = 'TRUE';
        process.env.NODE_ENV = 'Debug';
        stream.addTestMessage({
            requestId: 'id',
            functionEnvironmentReloadRequest: {
                environmentVariables: {},
                functionAppDirectory: null,
            },
        });
        sinon.assert.calledWith(stream.written, <rpc.IStreamingMessage>{
            requestId: 'id',
            functionEnvironmentReloadResponse: {
                result: {
                    status: rpc.StatusResult.Status.Success,
                },
            },
        });
        expect(process.env).to.be.empty;
    });

    it('reloads empty environment variables without throwing', () => {
        expect(() => {
            stream.write({
                requestId: 'id',
                functionEnvironmentReloadRequest: {
                    environmentVariables: {},
                    functionAppDirectory: null,
                },
            });
        }).to.not.throw();

        expect(() => {
            stream.write({
                requestId: 'id',
                functionEnvironmentReloadRequest: null,
            });
        }).to.not.throw();

        expect(() => {
            stream.write({
                requestId: 'id',
                functionEnvironmentReloadRequest: {
                    environmentVariables: null,
                    functionAppDirectory: null,
                },
            });
        }).to.not.throw();
    });

    it('reloads environment variable and keeps cwd without functionAppDirectory', () => {
        const cwd = process.cwd();
        stream.addTestMessage({
            requestId: 'id',
            functionEnvironmentReloadRequest: {
                environmentVariables: {
                    hello: 'world',
                    SystemDrive: 'Q:',
                },
                functionAppDirectory: null,
            },
        });
        sinon.assert.calledWith(stream.written, <rpc.IStreamingMessage>{
            requestId: 'id',
            functionEnvironmentReloadResponse: {
                result: {
                    status: rpc.StatusResult.Status.Success,
                },
            },
        });
        expect(process.env.hello).to.equal('world');
        expect(process.env.SystemDrive).to.equal('Q:');
        expect(process.cwd() == cwd);
    });

    it('reloads environment variable and changes functionAppDirectory', () => {
        const cwd = process.cwd();
        const newDir = '/';
        stream.addTestMessage({
            requestId: 'id',
            functionEnvironmentReloadRequest: {
                environmentVariables: {
                    hello: 'world',
                    SystemDrive: 'Q:',
                },
                functionAppDirectory: newDir,
            },
        });
        sinon.assert.calledWith(stream.written, <rpc.IStreamingMessage>{
            requestId: 'id',
            functionEnvironmentReloadResponse: {
                result: {
                    status: rpc.StatusResult.Status.Success,
                },
            },
        });
        expect(process.env.hello).to.equal('world');
        expect(process.env.SystemDrive).to.equal('Q:');
        expect(process.cwd() != newDir);
        expect(process.cwd() == newDir);
        process.chdir(cwd);
    });

    it('invokes function', () => {
        loader.getFunc.returns((context) => context.done());
        loader.getInfo.returns(new FunctionInfo(orchestratorBinding));

        const actualInvocationRequest = sendInvokeMessage([httpInputData], getHttpTriggerDataMock());
        assertInvocationSuccess([]);

        // triggerMedata will not be augmented with inpuDataValue since we are running Functions Host V3 compatability.
        expect(JSON.stringify(actualInvocationRequest.triggerMetadata!.$request)).to.be.undefined;
        expect(JSON.stringify(actualInvocationRequest.triggerMetadata!.req)).to.be.undefined;

        sinon.assert.calledWith(stream.written, <rpc.IStreamingMessage>{
            rpcLog: {
                category: "undefined.Invocation",
                invocationId: "1",
                message:
                    'Received FunctionInvocationRequest',
                level: LogLevel.Debug,
                logCategory: LogCategory.System,
            },
        });
    });

    it('returns correct data with $return binding', () => {
        let httpResponse;
        loader.getFunc.returns((context) => {
            httpResponse = context.res;
            context.done(null, { body: { hello: 'world' } });
        });
        loader.getInfo.returns(new FunctionInfo(httpReturnBinding));

        sendInvokeMessage([httpInputData], getHttpTriggerDataMock());

        const expectedOutput = [
            {
                data: {
                    http: httpResponse,
                },
                name: '$return',
            },
        ];
        const expectedReturnValue = {
            http: {
                body: { json: '{"hello":"world"}' },
                cookies: [],
                headers: {},
                statusCode: undefined,
            },
        };
        assertInvocationSuccess(expectedOutput, expectedReturnValue);
    });

    it('returns returned output if not http', () => {
        loader.getFunc.returns((context) => context.done(null, ['hello, seattle!', 'hello, tokyo!']));
        loader.getInfo.returns(new FunctionInfo(orchestratorBinding));

        sendInvokeMessage([], getHttpTriggerDataMock());

        const expectedOutput = [];
        const expectedReturnValue = {
            json: '["hello, seattle!","hello, tokyo!"]',
        };
        assertInvocationSuccess(expectedOutput, expectedReturnValue);
    });

    it('returned output is ignored if http', () => {
        loader.getFunc.returns((context) => context.done(null, ['hello, seattle!', 'hello, tokyo!']));
        loader.getInfo.returns(new FunctionInfo(httpResBinding));

        sendInvokeMessage([], getHttpTriggerDataMock());
        assertInvocationSuccess([], undefined);
    });

    it('serializes output binding data through context.done', () => {
        loader.getFunc.returns((context) => context.done(null, { res: { body: { hello: 'world' } } }));
        loader.getInfo.returns(new FunctionInfo(httpResBinding));

        sendInvokeMessage([httpInputData], getHttpTriggerDataMock());

        const expectedOutput = [
            {
                data: {
                    http: {
                        body: { json: '{"hello":"world"}' },
                        cookies: [],
                        headers: {},
                        statusCode: undefined,
                    },
                },
                name: 'res',
            },
        ];
        assertInvocationSuccess(expectedOutput);
    });

    it('serializes multiple output bindings through context.done and context.bindings', () => {
        loader.getFunc.returns((context) => {
            context.bindings.queueOutput = 'queue message';
            context.bindings.overriddenQueueOutput = 'start message';
            context.done(null, {
                res: { body: { hello: 'world' } },
                overriddenQueueOutput: 'override',
            });
        });
        loader.getInfo.returns(new FunctionInfo(multipleBinding));

        sendInvokeMessage([httpInputData], getHttpTriggerDataMock());
        const expectedOutput = [
            {
                data: {
                    http: {
                        body: { json: '{"hello":"world"}' },
                        cookies: [],
                        headers: {},
                        statusCode: undefined,
                    },
                },
                name: 'res',
            },
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
        assertInvocationSuccess(expectedOutput);
    });

    it('throws for malformed messages', () => {
        expect(() => {
            stream.write(<any>{
                functionLoadResponse: 1,
            });
        }).to.throw('functionLoadResponse.object expected');
    });

    describe('#invocationRequestBefore, #invocationRequestAfter', () => {
        afterEach(() => {
            channel['_invocationRequestAfter'] = [];
            channel['_invocationRequestBefore'] = [];
        });

        it('should apply hook before user function is executed', () => {
            channel.registerBeforeInvocationRequest((context, userFunction) => {
                context['magic_flag'] = 'magic value';
                return userFunction.bind({ __wrapped: true });
            });

            channel.registerBeforeInvocationRequest((context, userFunction) => {
                context['secondary_flag'] = 'magic value';
                return userFunction;
            });

            loader.getFunc.returns(function (this: any, context) {
                expect(context['magic_flag']).to.equal('magic value');
                expect(context['secondary_flag']).to.equal('magic value');
                expect(this.__wrapped).to.equal(true);
                expect(channel['_invocationRequestBefore'].length).to.equal(2);
                expect(channel['_invocationRequestAfter'].length).to.equal(0);
                context.done();
            });
            loader.getInfo.returns(new FunctionInfo(queueTriggerBinding));

            const actualInvocationRequest = sendInvokeMessage([httpInputData], getHttpTriggerDataMock());
            assertInvocationSuccess([]);

            expect(JSON.stringify(actualInvocationRequest.triggerMetadata!.$request)).to.be.undefined;
            expect(JSON.stringify(actualInvocationRequest.triggerMetadata!.req)).to.be.undefined;
        });

        it('should apply hook after user function is executed (callback)', (done) => {
            let finished = false;
            let count = 0;
            channel.registerAfterInvocationRequest((context) => {
                expect(finished).to.equal(true);
                count += 1;
            });

            loader.getFunc.returns(function (this: any, context) {
                finished = true;
                expect(channel['_invocationRequestBefore'].length).to.equal(0);
                expect(channel['_invocationRequestAfter'].length).to.equal(1);
                expect(count).to.equal(0);
                context.done();
                expect(count).to.equal(1);
                done();
            });
            loader.getInfo.returns(new FunctionInfo(queueTriggerBinding));

            const actualInvocationRequest = sendInvokeMessage([httpInputData], getHttpTriggerDataMock());
            assertInvocationSuccess([]);

            expect(JSON.stringify(actualInvocationRequest.triggerMetadata!.$request)).to.be.undefined;
            expect(JSON.stringify(actualInvocationRequest.triggerMetadata!.req)).to.be.undefined;
        });

        it('should apply hook after user function resolves (promise)', (done) => {
            let finished = false;
            let count = 0;
            channel.registerAfterInvocationRequest((context) => {
                expect(finished).to.equal(true);
                count += 1;
                expect(count).to.equal(1);
                assertInvocationSuccess([]);
                done();
            });

            loader.getFunc.returns(
                () =>
                    new Promise<void>((resolve) => {
                        finished = true;
                        expect(channel['_invocationRequestBefore'].length).to.equal(0);
                        expect(channel['_invocationRequestAfter'].length).to.equal(1);
                        expect(count).to.equal(0);
                        resolve();
                    })
            );
            loader.getInfo.returns(new FunctionInfo(queueTriggerBinding));

            sendInvokeMessage([httpInputData], getHttpTriggerDataMock());
        });

        it('should apply hook after user function rejects (promise)', (done) => {
            let finished = false;
            let count = 0;
            channel.registerAfterInvocationRequest((context) => {
                expect(finished).to.equal(true);
                count += 1;
                expect(count).to.equal(1);
                assertInvocationSuccess([]);
                done();
            });

            loader.getFunc.returns(
                (context) =>
                    new Promise((_, reject) => {
                        finished = true;
                        expect(channel['_invocationRequestBefore'].length).to.equal(0);
                        expect(channel['_invocationRequestAfter'].length).to.equal(1);
                        expect(count).to.equal(0);
                        reject();
                    })
            );
            loader.getInfo.returns(new FunctionInfo(queueTriggerBinding));

            sendInvokeMessage([httpInputData], getHttpTriggerDataMock());
        });

        it('responds to worker status', async () => {
            stream.addTestMessage({
                requestId: 'id',
                workerStatusRequest: {},
            });
            // Set slight delay
            await new Promise((resolve) => setTimeout(resolve, 100));
            sinon.assert.calledWith(stream.written, <rpc.IStreamingMessage>{
                requestId: 'id',
                workerStatusResponse: {},
            });
        });

        it('returns and serializes falsy value in Durable: ""', () => {
            loader.getFunc.returns((context) => context.done(null, ''));
            loader.getInfo.returns(new FunctionInfo(activityBinding));

            sendInvokeMessage([], getHttpTriggerDataMock());

            const expectedOutput = [];
            const expectedReturnValue = {
                string: '',
            };
            assertInvocationSuccess(expectedOutput, expectedReturnValue);
        });

        it('returns and serializes falsy value in Durable: 0', () => {
            loader.getFunc.returns((context) => context.done(null, 0));
            loader.getInfo.returns(new FunctionInfo(activityBinding));

            sendInvokeMessage([], getHttpTriggerDataMock());

            const expectedOutput = [];
            const expectedReturnValue = {
                int: 0,
            };
            assertInvocationSuccess(expectedOutput, expectedReturnValue);
        });

        it('returns and serializes falsy value in Durable: false', () => {
            loader.getFunc.returns((context) => context.done(null, false));
            loader.getInfo.returns(new FunctionInfo(activityBinding));

            sendInvokeMessage([], getHttpTriggerDataMock());

            const expectedOutput = [];
            const expectedReturnValue = {
                json: 'false',
            };
            assertInvocationSuccess(expectedOutput, expectedReturnValue);
        });

        it('logs AzureFiles cold start warning', async () => {
            process.env.WEBSITE_CONTENTAZUREFILECONNECTIONSTRING = 'test';
            process.env.WEBSITE_CONTENTSHARE = 'test';
            process.env.AzureWebJobsScriptRoot = 'test';

            // Accesing private method
            (channel as any).logColdStartWarning(10);

            // Set slight delay
            await new Promise((resolve) => setTimeout(resolve, 1000));
            sinon.assert.calledWith(stream.written, <rpc.IStreamingMessage>{
                rpcLog: {
                    message:
                        'package.json is not found at the root of the Function App in Azure Files - cold start for NodeJs can be affected.',
                    level: LogLevel.Debug,
                    logCategory: LogCategory.System,
                },
            });
        });
    });
});
