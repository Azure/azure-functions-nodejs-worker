// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import 'mocha';
import * as escapeStringRegexp from 'escape-string-regexp';
import * as path from 'path';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { getNodeVersionLog } from '../../src/utils/util';
import { testAppPath, testAppSrcPath } from './testAppUtils';
import { RegExpProps, RegExpStreamingMessage } from './TestEventStream';

type TestMessage = rpc.IStreamingMessage | RegExpStreamingMessage;

function stackTraceRegExpProps(responseName: string, message: string): RegExpProps {
    return {
        [`${responseName}.result.exception.stackTrace`]: new RegExp(`Error: ${escapeStringRegexp(message)}\\s*at`),
    };
}

function workerMetadataRegExps(responseName: string) {
    return {
        [`${responseName}.workerMetadata.runtimeVersion`]: /^[0-9]+\.[0-9]+\.[0-9]+$/,
        [`${responseName}.workerMetadata.workerBitness`]: /^(x64|x86|arm64)$/,
        [`${responseName}.workerMetadata.workerVersion`]: /^(3|4)\.[0-9]+\.[0-9]+$/,
        [`${responseName}.workerMetadata.customProperties.modelVersion`]: /^(3|4)\.[0-9]+\.[0-9]+$/,
    };
}

export function errorLog(message: string | RegExp): TestMessage {
    return log(message, rpc.RpcLog.Level.Error);
}

export function warningLog(message: string | RegExp): TestMessage {
    return log(message, rpc.RpcLog.Level.Warning);
}

export function debugLog(message: string | RegExp): TestMessage {
    return log(message, rpc.RpcLog.Level.Debug);
}

export function infoLog(message: string | RegExp): TestMessage {
    return log(message, rpc.RpcLog.Level.Information);
}

export function log(message: string | RegExp, level: rpc.RpcLog.Level): TestMessage {
    if (typeof message === 'string') {
        return {
            rpcLog: {
                message,
                level,
                logCategory: rpc.RpcLog.RpcLogCategory.System,
            },
        };
    } else {
        return new RegExpStreamingMessage(
            {
                rpcLog: {
                    level,
                    logCategory: rpc.RpcLog.RpcLogCategory.System,
                },
            },
            {
                'rpcLog.message': message,
            }
        );
    }
}

export const noHandlerError = errorLog("Worker had no handler for message 'undefined'");

export const noPackageJsonWarning = warningLog('Worker failed to load package.json: file does not exist');

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
            level: rpc.RpcLog.Level.Debug,
            logCategory: rpc.RpcLog.RpcLogCategory.System,
        },
    };
}

export function executedAppHooksLog(hookName: string): TestMessage {
    return {
        rpcLog: {
            category: undefined,
            invocationId: undefined,
            message: `Executed "${hookName}" hooks`,
            level: rpc.RpcLog.Level.Debug,
            logCategory: rpc.RpcLog.RpcLogCategory.System,
        },
    };
}

const capabilities = {
    RawHttpBodyBytes: 'true',
    RpcHttpBodyOnly: 'true',
    RpcHttpTriggerMetadataRemoved: 'true',
    IgnoreEmptyValuedRpcHttpHeaders: 'true',
    UseNullableValueDictionaryForHttp: 'true',
    WorkerStatus: 'true',
    TypedDataCollection: 'true',
    HandlesWorkerTerminateMessage: 'true',
};

export const coldStartWarning = debugLog(
    'package.json is not found at the root of the Function App in Azure Files - cold start for NodeJs can be affected.'
);

export function request(functionAppDirectory: string = __dirname, hostVersion = '2.7.0'): rpc.IStreamingMessage {
    return {
        requestId: 'testReqId',
        workerInitRequest: {
            capabilities: {},
            functionAppDirectory,
            hostVersion,
        },
    };
}

export const response = new RegExpStreamingMessage(
    {
        requestId: 'testReqId',
        workerInitResponse: {
            capabilities,
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
    workerMetadataRegExps('workerInitResponse')
);

export function failedResponse(errorMessage: string): RegExpStreamingMessage {
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
                customProperties: {
                    modelName: '@azure/functions',
                },
            },
        },
    };
    return new RegExpStreamingMessage(expectedMsg, {
        ...stackTraceRegExpProps('workerInitResponse', errorMessage),
        ...workerMetadataRegExps('workerInitResponse'),
    });
}

export function reloadEnvVarsLog(numVars: number): TestMessage {
    return msg.infoLog(`Reloading environment variables. Found ${numVars} variables to reload.`);
}

export function changingCwdLog(dir = '/'): TestMessage {
    return msg.infoLog(`Changing current working directory to ${dir}`);
}

export function nodeVersionLog(): TestMessage | undefined {
    const result = getNodeVersionLog(process.version);
    if (result?.level == rpc.RpcLog.Level.Error) {
        return msg.errorLog(result.message);
    } else if (result?.level == rpc.RpcLog.Level.Warning) {
        return msg.warningLog(result.message);
    }
    return undefined;
}

export const funcAppDirNotDefined = debugLog('FunctionEnvironmentReload functionAppDirectory is not defined');

export const funcAppDirNotChanged = debugLog('FunctionEnvironmentReload functionAppDirectory has not changed');

export function logWithInvocation(message: string | RegExp, level: rpc.RpcLog.Level): TestMessage {
    if (typeof message === 'string') {
        return {
            rpcLog: {
                category: 'testFuncName.Invocation',
                invocationId: '1',
                message,
                level,
                logCategory: rpc.RpcLog.RpcLogCategory.System,
            },
        };
    } else {
        return new RegExpStreamingMessage(
            {
                rpcLog: {
                    category: 'testFuncName.Invocation',
                    invocationId: '1',
                    level,
                    logCategory: rpc.RpcLog.RpcLogCategory.System,
                },
            },
            {
                'rpcLog.message': message,
            }
        );
    }
}

export const msg = {
    errorLog,
    warningLog,
    debugLog,
    infoLog,
    log,
    noHandlerError,
    noPackageJsonWarning,
    receivedRequestLog,
    loadingEntryPoint,
    loadedEntryPoint,
    executingAppHooksLog,
    executedAppHooksLog,
    capabilities,
    init: {
        receivedRequestLog: receivedRequestLog('WorkerInitRequest'),
        coldStartWarning,
        nodeVersionLog,
        request,
        response,
        failedResponse,
    },
    envReload: {
        reloadEnvVarsLog,
        changingCwdLog,
        nodeVersionLog,
        funcAppDirNotDefined,
        funcAppDirNotChanged,
        response: new RegExpStreamingMessage(
            {
                requestId: 'testReqId',
                functionEnvironmentReloadResponse: {
                    result: {
                        status: rpc.StatusResult.Status.Success,
                    },
                    capabilities,
                    capabilitiesUpdateStrategy:
                        rpc.FunctionEnvironmentReloadResponse.CapabilitiesUpdateStrategy.replace,
                    workerMetadata: {
                        runtimeName: 'node',
                        customProperties: {
                            modelName: '@azure/functions',
                        },
                    },
                },
            },
            workerMetadataRegExps('functionEnvironmentReloadResponse')
        ),
    },
    indexing: {
        request: {
            requestId: 'testReqId',
            functionsMetadataRequest: {
                functionAppDirectory: testAppPath,
            },
        },

        receivedRequestLog: receivedRequestLog('FunctionsMetadataRequest'),

        response(functions: rpc.IRpcFunctionMetadata[], useDefaultMetadataIndexing: boolean): TestMessage {
            const response: rpc.IStreamingMessage = {
                requestId: 'testReqId',
                functionMetadataResponse: {
                    useDefaultMetadataIndexing: useDefaultMetadataIndexing,
                    result: {
                        status: rpc.StatusResult.Status.Success,
                    },
                },
            };
            if (!useDefaultMetadataIndexing) {
                response.functionMetadataResponse!.functionMetadataResults = functions;
            }
            return response;
        },

        failedResponse(errorMessage: string, useDefaultMetadataIndexing: boolean): RegExpStreamingMessage {
            const expectedMsg: rpc.IStreamingMessage = {
                requestId: 'testReqId',
                functionMetadataResponse: {
                    useDefaultMetadataIndexing: useDefaultMetadataIndexing,
                    result: {
                        status: rpc.StatusResult.Status.Failure,
                        exception: {
                            message: errorMessage,
                        },
                    },
                },
            };
            return new RegExpStreamingMessage(expectedMsg, {
                ...stackTraceRegExpProps('functionMetadataResponse', errorMessage),
            });
        },
    },
    funcLoad: {
        receivedRequestLog: receivedRequestLog('FunctionLoadRequest'),

        request(fileName: string, extraMetadata?: rpc.IRpcFunctionMetadata): rpc.IStreamingMessage {
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
        },

        response: {
            requestId: 'testReqId',
            functionLoadResponse: {
                functionId: 'testFuncId',
                result: {
                    status: rpc.StatusResult.Status.Success,
                },
            },
        },

        failedResponse(message: string): TestMessage {
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
        },
    },
    invocation: {
        errorLog(message: string | RegExp): TestMessage {
            return logWithInvocation(message, rpc.RpcLog.Level.Error);
        },
        warningLog(message: string | RegExp): TestMessage {
            return logWithInvocation(message, rpc.RpcLog.Level.Warning);
        },
        debugLog(message: string | RegExp): TestMessage {
            return logWithInvocation(message, rpc.RpcLog.Level.Debug);
        },
        infoLog(message: string | RegExp): TestMessage {
            return logWithInvocation(message, rpc.RpcLog.Level.Information);
        },
        log(message: string | RegExp, level: rpc.RpcLog.Level): TestMessage {
            if (typeof message === 'string') {
                return {
                    rpcLog: {
                        category: 'testFuncName.Invocation',
                        invocationId: '1',
                        message,
                        level,
                        logCategory: rpc.RpcLog.RpcLogCategory.System,
                    },
                };
            } else {
                return new RegExpStreamingMessage(
                    {
                        rpcLog: {
                            category: 'testFuncName.Invocation',
                            invocationId: '1',
                            level,
                            logCategory: rpc.RpcLog.RpcLogCategory.System,
                        },
                    },
                    {
                        'rpcLog.message': message,
                    }
                );
            }
        },
        receivedRequestLog: logWithInvocation(
            'Worker 00000000-0000-0000-0000-000000000000 received FunctionInvocationRequest with invocationId 1',
            rpc.RpcLog.Level.Debug
        ),
        executingHooksLog(count: number, hookName: string): TestMessage {
            return msg.invocation.debugLog(`Executing ${count} "${hookName}" hooks`);
        },
        executedHooksLog(hookName: string): TestMessage {
            return msg.invocation.debugLog(`Executed "${hookName}" hooks`);
        },
        asyncAndDoneError: logWithInvocation(
            "Error: Choose either to return a promise or call 'done'. Do not use both in your script. Learn more: https://go.microsoft.com/fwlink/?linkid=2097909",
            rpc.RpcLog.Level.Error
        ),
        duplicateDoneError: logWithInvocation(
            "Error: 'done' has already been called. Please check your script for extraneous calls to 'done'.",
            rpc.RpcLog.Level.Error
        ),
        unexpectedLogAfterDoneLog: logWithInvocation(
            "Warning: Unexpected call to 'log' on the context object after function execution has completed. Please check for asynchronous calls that are not awaited or calls to 'done' made before function execution completes. Function name: testFuncName. Invocation Id: 1. Learn more: https://go.microsoft.com/fwlink/?linkid=2097909",
            rpc.RpcLog.Level.Warning
        ),
        userLog(data = 'testUserLog', level = rpc.RpcLog.Level.Information): TestMessage {
            return {
                rpcLog: {
                    category: 'testFuncName.Invocation',
                    invocationId: '1',
                    message: data,
                    level,
                    logCategory: rpc.RpcLog.RpcLogCategory.User,
                },
            };
        },
        request(inputData?: rpc.IParameterBinding[] | null): rpc.IStreamingMessage {
            return {
                requestId: 'testReqId',
                invocationRequest: {
                    functionId: 'testFuncId',
                    invocationId: '1',
                    inputData: inputData,
                },
            };
        },
        response(expectedOutputData?: rpc.IParameterBinding[] | null, expectedReturnValue?: rpc.ITypedData | null) {
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
        },
        failedResponse(message = 'testErrorMessage'): TestMessage {
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
        },
    },
    terminate: {
        request(gracePeriodSeconds = 5): rpc.IStreamingMessage {
            return {
                workerTerminate: {
                    gracePeriod: {
                        seconds: gracePeriodSeconds,
                    },
                },
            };
        },
        receivedWorkerTerminateLog: debugLog('Received workerTerminate message; gracefully shutting down worker'),
    },
};
