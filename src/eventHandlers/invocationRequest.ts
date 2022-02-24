// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { format } from 'util';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { CreateContextAndInputs, LogCallback, ResultCallback } from '../Context';
import { toTypedData } from '../converters';
import { toRpcStatus } from '../utils/toRpcStatus';
import { WorkerChannel } from '../WorkerChannel';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

/**
 * Host requests worker to invoke a Function
 * @param requestId gRPC message request id
 * @param msg gRPC message content
 */
export function invocationRequest(channel: WorkerChannel, requestId: string, msg: rpc.InvocationRequest) {
    const info = channel.functionLoader.getInfo(msg.functionId);
    const logCallback: LogCallback = (level, category, ...args) => {
        channel.log({
            invocationId: msg.invocationId,
            category: `${info.name}.Invocation`,
            message: format.apply(null, <[any, any[]]>args),
            level: level,
            logCategory: category,
        });
    };

    // Log invocation details to ensure the invocation received by node worker
    logCallback(LogLevel.Debug, LogCategory.System, 'Received FunctionInvocationRequest');

    const resultCallback: ResultCallback = (err, result) => {
        const response: rpc.IInvocationResponse = {
            invocationId: msg.invocationId,
            result: toRpcStatus(err),
        };
        // explicitly set outputData to empty array to concat later
        response.outputData = [];

        // As legacy behavior, falsy values get serialized to `null` in AzFunctions.
        // This breaks Durable Functions expectations, where customers expect any
        // JSON-serializable values to be preserved by the framework,
        // so we check if we're serializing for durable and, if so, ensure falsy
        // values get serialized.
        const isDurableBinding = info?.bindings?.name?.type == 'activityTrigger';

        try {
            if (result || (isDurableBinding && result != null)) {
                const returnBinding = info.getReturnBinding();
                // Set results from return / context.done
                if (result.return || (isDurableBinding && result.return != null)) {
                    // $return binding is found: return result data to $return binding
                    if (returnBinding) {
                        response.returnValue = returnBinding.converter(result.return);
                        // $return binding is not found: read result as object of outputs
                    } else {
                        response.outputData = Object.keys(info.outputBindings)
                            .filter((key) => result.return[key] !== undefined)
                            .map(
                                (key) =>
                                    <rpc.IParameterBinding>{
                                        name: key,
                                        data: info.outputBindings[key].converter(result.return[key]),
                                    }
                            );
                    }
                    // returned value does not match any output bindings (named or $return)
                    // if not http, pass along value
                    if (!response.returnValue && response.outputData.length == 0 && !info.hasHttpTrigger) {
                        response.returnValue = toTypedData(result.return);
                    }
                }
                // Set results from context.bindings
                if (result.bindings) {
                    response.outputData = response.outputData.concat(
                        Object.keys(info.outputBindings)
                            // Data from return prioritized over data from context.bindings
                            .filter((key) => {
                                const definedInBindings: boolean = result.bindings[key] !== undefined;
                                const hasReturnValue = !!result.return;
                                const hasReturnBinding = !!returnBinding;
                                const definedInReturn: boolean =
                                    hasReturnValue && !hasReturnBinding && result.return[key] !== undefined;
                                return definedInBindings && !definedInReturn;
                            })
                            .map(
                                (key) =>
                                    <rpc.IParameterBinding>{
                                        name: key,
                                        data: info.outputBindings[key].converter(result.bindings[key]),
                                    }
                            )
                    );
                }
            }
        } catch (e) {
            response.result = toRpcStatus(e);
        }
        channel.eventStream.write({
            requestId: requestId,
            invocationResponse: response,
        });

        channel.runInvocationRequestAfter(context);
    };

    const { context, inputs } = CreateContextAndInputs(info, msg, logCallback, resultCallback);
    let userFunction = channel.functionLoader.getFunc(msg.functionId);

    userFunction = channel.runInvocationRequestBefore(context, userFunction);

    // catch user errors from the same async context in the event loop and correlate with invocation
    // throws from asynchronous work (setTimeout, etc) are caught by 'unhandledException' and cannot be correlated with invocation
    try {
        const result = userFunction(context, ...inputs);

        if (result && typeof result.then === 'function') {
            result
                .then((result) => {
                    (<any>context.done)(null, result, true);
                })
                .catch((err) => {
                    (<any>context.done)(err, null, true);
                });
        }
    } catch (err) {
        resultCallback(err);
    }
}
