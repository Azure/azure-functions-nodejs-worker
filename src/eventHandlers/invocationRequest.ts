// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzureFunction } from '@azure/functions';
import { HookData, PostInvocationContext, PreInvocationContext } from '@azure/functions-core';
import { format } from 'util';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { CreateContextAndInputs } from '../Context';
import { toTypedData } from '../converters/RpcConverters';
import { isError } from '../utils/ensureErrorType';
import { nonNullProp } from '../utils/nonNull';
import { toRpcStatus } from '../utils/toRpcStatus';
import { WorkerChannel } from '../WorkerChannel';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

/**
 * Host requests worker to invoke a Function
 * @param requestId gRPC message request id
 * @param msg gRPC message content
 */
export async function invocationRequest(channel: WorkerChannel, requestId: string, msg: rpc.IInvocationRequest) {
    const response: rpc.IInvocationResponse = {
        invocationId: msg.invocationId,
        result: toRpcStatus(),
    };
    // explicitly set outputData to empty array to concat later
    response.outputData = [];

    let isDone = false;
    let isExecutingPostInvocationHooks = false;
    let resultIsPromise = false;

    const info = channel.functionLoader.getInfo(nonNullProp(msg, 'functionId'));
    const asyncDoneLearnMoreLink = 'https://go.microsoft.com/fwlink/?linkid=2097909';

    const msgCategory = `${info.name}.Invocation`;
    function log(level: LogLevel, logCategory: LogCategory, ...args: any[]) {
        channel.log({
            invocationId: msg.invocationId,
            category: msgCategory,
            message: format.apply(null, <[any, any[]]>args),
            level: level,
            logCategory,
        });
    }
    function systemLog(level: LogLevel, ...args: any[]) {
        log(level, LogCategory.System, ...args);
    }
    function userLog(level: LogLevel, ...args: any[]) {
        if (isDone && !isExecutingPostInvocationHooks) {
            let badAsyncMsg =
                "Warning: Unexpected call to 'log' on the context object after function execution has completed. Please check for asynchronous calls that are not awaited or calls to 'done' made before function execution completes. ";
            badAsyncMsg += `Function name: ${info.name}. Invocation Id: ${msg.invocationId}. `;
            badAsyncMsg += `Learn more: ${asyncDoneLearnMoreLink}`;
            systemLog(LogLevel.Warning, badAsyncMsg);
        }
        log(level, LogCategory.User, ...args);
    }

    // Log invocation details to ensure the invocation received by node worker
    systemLog(LogLevel.Debug, 'Received FunctionInvocationRequest');

    function onDone(): void {
        if (isDone) {
            const message = resultIsPromise
                ? `Error: Choose either to return a promise or call 'done'. Do not use both in your script. Learn more: ${asyncDoneLearnMoreLink}`
                : "Error: 'done' has already been called. Please check your script for extraneous calls to 'done'.";
            systemLog(LogLevel.Error, message);
        }
        isDone = true;
    }

    let { context, inputs, doneEmitter } = CreateContextAndInputs(info, msg, userLog);
    try {
        const legacyDoneTask = new Promise((resolve, reject) => {
            doneEmitter.on('done', (err?: unknown, result?: any) => {
                onDone();
                if (isError(err)) {
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });

        const hookData: HookData = {};
        let userFunction = channel.functionLoader.getFunc(nonNullProp(msg, 'functionId'));
        const preInvocContext: PreInvocationContext = {
            hookData,
            invocationContext: context,
            functionCallback: <AzureFunction>userFunction,
            inputs,
        };

        await channel.executeHooks('preInvocation', preInvocContext, msg.invocationId, msgCategory);
        inputs = preInvocContext.inputs;
        userFunction = preInvocContext.functionCallback;

        let rawResult = userFunction(context, ...inputs);
        resultIsPromise = rawResult && typeof rawResult.then === 'function';
        let resultTask: Promise<any>;
        if (resultIsPromise) {
            rawResult = Promise.resolve(rawResult).then((r) => {
                onDone();
                return r;
            });
            resultTask = Promise.race([rawResult, legacyDoneTask]);
        } else {
            resultTask = legacyDoneTask;
        }

        const postInvocContext: PostInvocationContext = {
            hookData,
            invocationContext: context,
            inputs,
            result: null,
            error: null,
        };
        try {
            postInvocContext.result = await resultTask;
        } catch (err) {
            postInvocContext.error = err;
        }

        try {
            isExecutingPostInvocationHooks = true;
            await channel.executeHooks('postInvocation', postInvocContext, msg.invocationId, msgCategory);
        } finally {
            isExecutingPostInvocationHooks = false;
        }

        if (isError(postInvocContext.error)) {
            throw postInvocContext.error;
        }
        const result = postInvocContext.result;

        // Allow HTTP response from context.res if HTTP response is not defined from the context.bindings object
        if (info.httpOutputName && context.res && context.bindings[info.httpOutputName] === undefined) {
            context.bindings[info.httpOutputName] = context.res;
        }

        // As legacy behavior, falsy values get serialized to `null` in AzFunctions.
        // This breaks Durable Functions expectations, where customers expect any
        // JSON-serializable values to be preserved by the framework,
        // so we check if we're serializing for durable and, if so, ensure falsy
        // values get serialized.
        const isDurableBinding = info?.bindings?.name?.type == 'activityTrigger';

        const returnBinding = info.getReturnBinding();
        // Set results from return / context.done
        if (result || (isDurableBinding && result != null)) {
            // $return binding is found: return result data to $return binding
            if (returnBinding) {
                response.returnValue = returnBinding.converter(result);
                // $return binding is not found: read result as object of outputs
            } else {
                response.outputData = Object.keys(info.outputBindings)
                    .filter((key) => result[key] !== undefined)
                    .map(
                        (key) =>
                            <rpc.IParameterBinding>{
                                name: key,
                                data: info.outputBindings[key].converter(result[key]),
                            }
                    );
            }
            // returned value does not match any output bindings (named or $return)
            // if not http, pass along value
            if (!response.returnValue && response.outputData.length == 0 && !info.hasHttpTrigger) {
                response.returnValue = toTypedData(result);
            }
        }
        // Set results from context.bindings
        if (context.bindings) {
            response.outputData = response.outputData.concat(
                Object.keys(info.outputBindings)
                    // Data from return prioritized over data from context.bindings
                    .filter((key) => {
                        const definedInBindings: boolean = context.bindings[key] !== undefined;
                        const hasReturnValue = !!result;
                        const hasReturnBinding = !!returnBinding;
                        const definedInReturn: boolean =
                            hasReturnValue && !hasReturnBinding && result[key] !== undefined;
                        return definedInBindings && !definedInReturn;
                    })
                    .map(
                        (key) =>
                            <rpc.IParameterBinding>{
                                name: key,
                                data: info.outputBindings[key].converter(context.bindings[key]),
                            }
                    )
            );
        }
    } catch (err) {
        response.result = toRpcStatus(err);
        isDone = true;
    }

    channel.eventStream.write({
        requestId: requestId,
        invocationResponse: response,
    });
}
