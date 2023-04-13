// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import 'mocha';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { RegExpProps, RegExpStreamingMessage } from './TestEventStream';
import { testAppSrcPath } from './testAppUtils';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;
import escapeStringRegexp = require('escape-string-regexp');
import path = require('path');

type TestMessage = rpc.IStreamingMessage | RegExpStreamingMessage;

function stackTraceRegExpProps(responseName: string, message: string): RegExpProps {
    return {
        [`${responseName}.result.exception.stackTrace`]: new RegExp(`Error: ${escapeStringRegexp(message)}\\s*at`),
    };
}

export namespace msg {
    export function errorLog(message: string | RegExp): TestMessage {
        return log(message, LogLevel.Error);
    }

    export function warningLog(message: string | RegExp): TestMessage {
        return log(message, LogLevel.Warning);
    }

    export function debugLog(message: string | RegExp): TestMessage {
        return log(message, LogLevel.Debug);
    }

    export function infoLog(message: string | RegExp): TestMessage {
        return log(message, LogLevel.Information);
    }

    export function log(message: string | RegExp, level: LogLevel): TestMessage {
        if (typeof message === 'string') {
            return {
                rpcLog: {
                    message,
                    level,
                    logCategory: LogCategory.System,
                },
            };
        } else {
            return new RegExpStreamingMessage(
                {
                    rpcLog: {
                        level,
                        logCategory: LogCategory.System,
                    },
                },
                {
                    'rpcLog.message': message,
                }
            );
        }
    }

    export const noHandlerError = msg.errorLog("Worker had no handler for message 'undefined'");

    export const noPackageJsonWarning = msg.warningLog('Worker failed to load package.json: file does not exist');

    export function receivedRequestLog(requestName: string): TestMessage {
        return debugLog(`Worker 00000000-0000-0000-0000-000000000000 received ${requestName}`);
    }

    export function loadingEntryPoint(fileName: string): TestMessage {
        return msg.debugLog(`Loading entry point file "${fileName}"`);
    }

    export function loadedEntryPoint(fileName: string): TestMessage {
        return msg.debugLog(`Loaded entry point file "${fileName}"`);
    }

    export function executingAppHooksLog(count: number, hookName: string): TestMessage {
        return {
            rpcLog: {
                category: undefined,
                invocationId: undefined,
                message: `Executing ${count} "${hookName}" hooks`,
                level: LogLevel.Debug,
                logCategory: LogCategory.System,
            },
        };
    }

    export function executedAppHooksLog(hookName: string): TestMessage {
        return {
            rpcLog: {
                category: undefined,
                invocationId: undefined,
                message: `Executed "${hookName}" hooks`,
                level: LogLevel.Debug,
                logCategory: LogCategory.System,
            },
        };
    }

    export namespace init {
        export const receivedRequestLog = msg.receivedRequestLog('WorkerInitRequest');

        export const coldStartWarning = msg.debugLog(
            'package.json is not found at the root of the Function App in Azure Files - cold start for NodeJs can be affected.'
        );

        export function request(
            functionAppDirectory: string = __dirname,
            hostVersion = '2.7.0'
        ): rpc.IStreamingMessage {
            return {
                requestId: 'testReqId',
                workerInitRequest: {
                    capabilities: {},
                    functionAppDirectory,
                    hostVersion,
                },
            };
        }

        const workerMetadataRegExps = {
            'workerInitResponse.workerMetadata.runtimeVersion': /^[0-9]+\.[0-9]+\.[0-9]+$/,
            'workerInitResponse.workerMetadata.workerBitness': /^(x64|ia32|arm64)$/,
            'workerInitResponse.workerMetadata.workerVersion': /^3\.[0-9]+\.[0-9]+$/,
            'workerInitResponse.workerMetadata.customProperties.modelVersion': /^3\.[0-9]+\.[0-9]+$/,
        };

        export const response = new RegExpStreamingMessage(
            {
                requestId: 'testReqId',
                workerInitResponse: {
                    capabilities: {
                        RawHttpBodyBytes: 'true',
                        RpcHttpBodyOnly: 'true',
                        RpcHttpTriggerMetadataRemoved: 'true',
                        IgnoreEmptyValuedRpcHttpHeaders: 'true',
                        UseNullableValueDictionaryForHttp: 'true',
                        WorkerStatus: 'true',
                        TypedDataCollection: 'true',
                        HandlesWorkerTerminateMessage: 'true',
                    },
                    result: {
                        status: rpc.StatusResult.Status.Success,
                    },
                    workerMetadata: {
                        runtimeName: 'node',
                        customProperties: {
                            modelName: '@azure/functions',
                        },
                    },
                },
            },
            workerMetadataRegExps
        );

        export function failedResponse(fileName: string, errorMessage: string): RegExpStreamingMessage {
            const expectedMsg: rpc.IStreamingMessage = {
                requestId: 'testReqId',
                workerInitResponse: {
                    result: {
                        status: rpc.StatusResult.Status.Failure,
                        exception: {
                            message: errorMessage,
                        },
                    },
                    workerMetadata: {
                        runtimeName: 'node',
                    },
                },
            };
            return new RegExpStreamingMessage(expectedMsg, {
                ...stackTraceRegExpProps('workerInitResponse', errorMessage),
                ...workerMetadataRegExps,
            });
        }
    }

    export namespace envReload {
        export function reloadEnvVarsLog(numVars: number): TestMessage {
            return msg.infoLog(`Reloading environment variables. Found ${numVars} variables to reload.`);
        }

        export function changingCwdLog(dir = '/'): TestMessage {
            return msg.infoLog(`Changing current working directory to ${dir}`);
        }

        const workerMetadataRegExps = {
            'functionEnvironmentReloadResponse.workerMetadata.runtimeVersion': /^[0-9]+\.[0-9]+\.[0-9]+$/,
            'functionEnvironmentReloadResponse.workerMetadata.workerBitness': /^(x64|ia32|arm64)$/,
            'functionEnvironmentReloadResponse.workerMetadata.workerVersion': /^3\.[0-9]+\.[0-9]+$/,
            'functionEnvironmentReloadResponse.workerMetadata.customProperties.modelVersion': /^3\.[0-9]+\.[0-9]+$/,
        };

        export const response = new RegExpStreamingMessage(
            {
                requestId: 'testReqId',
                functionEnvironmentReloadResponse: {
                    result: {
                        status: rpc.StatusResult.Status.Success,
                    },
                    workerMetadata: {
                        runtimeName: 'node',
                        customProperties: {
                            modelName: '@azure/functions',
                        },
                    },
                },
            },
            workerMetadataRegExps
        );
    }

    export namespace indexing {
        export const receivedRequestLog = msg.receivedRequestLog('FunctionsMetadataRequest');

        export function response(functions: rpc.IRpcFunctionMetadata[] = []): TestMessage {
            const response: rpc.IStreamingMessage = {
                requestId: 'testReqId',
                functionMetadataResponse: {
                    useDefaultMetadataIndexing: functions.length === 0,
                    result: {
                        status: rpc.StatusResult.Status.Success,
                    },
                },
            };
            if (functions.length > 0) {
                response.functionMetadataResponse!.functionMetadataResults = functions;
            }
            return response;
        }
    }

    export namespace funcLoad {
        export const receivedRequestLog = msg.receivedRequestLog('FunctionLoadRequest');

        export function request(fileName: string, extraMetadata?: rpc.IRpcFunctionMetadata): rpc.IStreamingMessage {
            return {
                requestId: 'testReqId',
                functionLoadRequest: {
                    functionId: 'testFuncId',
                    metadata: {
                        name: 'testFuncName',
                        scriptFile: path.join(testAppSrcPath, fileName),
                        ...extraMetadata,
                    },
                },
            };
        }

        export const response = {
            requestId: 'testReqId',
            functionLoadResponse: {
                functionId: 'testFuncId',
                result: {
                    status: rpc.StatusResult.Status.Success,
                },
            },
        };

        export function failedResponse(message: string): TestMessage {
            return new RegExpStreamingMessage(
                {
                    requestId: 'testReqId',
                    functionLoadResponse: {
                        functionId: 'testFuncId',
                        result: {
                            status: rpc.StatusResult.Status.Failure,
                            exception: {
                                message,
                            },
                        },
                    },
                },
                stackTraceRegExpProps('functionLoadResponse', message)
            );
        }
    }

    export namespace invocation {
        export function errorLog(message: string | RegExp): TestMessage {
            return log(message, LogLevel.Error);
        }

        export function warningLog(message: string | RegExp): TestMessage {
            return log(message, LogLevel.Warning);
        }

        export function debugLog(message: string | RegExp): TestMessage {
            return log(message, LogLevel.Debug);
        }

        export function infoLog(message: string | RegExp): TestMessage {
            return log(message, LogLevel.Information);
        }

        export function log(message: string | RegExp, level: LogLevel): TestMessage {
            if (typeof message === 'string') {
                return {
                    rpcLog: {
                        category: 'testFuncName.Invocation',
                        invocationId: '1',
                        message,
                        level,
                        logCategory: LogCategory.System,
                    },
                };
            } else {
                return new RegExpStreamingMessage(
                    {
                        rpcLog: {
                            category: 'testFuncName.Invocation',
                            invocationId: '1',
                            level,
                            logCategory: LogCategory.System,
                        },
                    },
                    {
                        'rpcLog.message': message,
                    }
                );
            }
        }

        export const receivedRequestLog = msg.invocation.debugLog(
            'Worker 00000000-0000-0000-0000-000000000000 received FunctionInvocationRequest'
        );

        export function executingHooksLog(count: number, hookName: string): TestMessage {
            return msg.invocation.debugLog(`Executing ${count} "${hookName}" hooks`);
        }

        export function executedHooksLog(hookName: string): TestMessage {
            return msg.invocation.debugLog(`Executed "${hookName}" hooks`);
        }

        export const asyncAndDoneError = msg.invocation.errorLog(
            "Error: Choose either to return a promise or call 'done'. Do not use both in your script. Learn more: https://go.microsoft.com/fwlink/?linkid=2097909"
        );

        export const duplicateDoneError = msg.invocation.errorLog(
            "Error: 'done' has already been called. Please check your script for extraneous calls to 'done'."
        );

        export const unexpectedLogAfterDoneLog = msg.invocation.warningLog(
            "Warning: Unexpected call to 'log' on the context object after function execution has completed. Please check for asynchronous calls that are not awaited or calls to 'done' made before function execution completes. Function name: testFuncName. Invocation Id: 1. Learn more: https://go.microsoft.com/fwlink/?linkid=2097909"
        );

        export function userLog(data = 'testUserLog'): TestMessage {
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

        export function request(inputData?: rpc.IParameterBinding[] | null): rpc.IStreamingMessage {
            return {
                requestId: 'testReqId',
                invocationRequest: {
                    functionId: 'testFuncId',
                    invocationId: '1',
                    inputData: inputData,
                },
            };
        }

        export function response(
            expectedOutputData?: rpc.IParameterBinding[] | null,
            expectedReturnValue?: rpc.ITypedData | null
        ) {
            const msg: TestMessage = {};
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

        export function failedResponse(message = 'testErrorMessage'): TestMessage {
            return new RegExpStreamingMessage(
                {
                    requestId: 'testReqId',
                    invocationResponse: {
                        invocationId: '1',
                        result: {
                            status: rpc.StatusResult.Status.Failure,
                            exception: {
                                message,
                            },
                        },
                    },
                },
                stackTraceRegExpProps('invocationResponse', message)
            );
        }
    }

    export namespace terminate {
        export function request(gracePeriodSeconds = 5): rpc.IStreamingMessage {
            return {
                workerTerminate: {
                    gracePeriod: {
                        seconds: gracePeriodSeconds,
                    },
                },
            };
        }

        export const receivedWorkerTerminateLog = msg.debugLog(
            'Received workerTerminate message; gracefully shutting down worker'
        );
    }
}
