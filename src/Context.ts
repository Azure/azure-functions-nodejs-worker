// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import {
    BindingDefinition,
    Context,
    ContextBindingData,
    ContextBindings,
    ExecutionContext,
    Logger,
    TraceContext,
} from '@azure/functions';
import { v4 as uuid } from 'uuid';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import {
    convertKeysToCamelCase,
    fromRpcTraceContext,
    fromTypedData,
    getBindingDefinitions,
    getNormalizedBindingData,
} from './converters';
import { FunctionInfo } from './FunctionInfo';
import { Request } from './http/Request';
import { Response } from './http/Response';
import EventEmitter = require('events');
import LogLevel = rpc.RpcLog.Level;

export function CreateContextAndInputs(
    info: FunctionInfo,
    request: rpc.IInvocationRequest,
    userLogCallback: UserLogCallback
) {
    const doneEmitter = new EventEmitter();
    const context = new InvocationContext(info, request, userLogCallback, doneEmitter);

    const bindings: ContextBindings = {};
    const inputs: any[] = [];
    let httpInput: Request | undefined;
    for (const binding of <rpc.IParameterBinding[]>request.inputData) {
        if (binding.data && binding.name) {
            let input;
            if (binding.data && binding.data.http) {
                input = httpInput = new Request(binding.data.http);
            } else {
                // TODO: Don't hard code fix for camelCase https://github.com/Azure/azure-functions-nodejs-worker/issues/188
                if (info.getTimerTriggerName() === binding.name) {
                    // v2 worker converts timer trigger object to camelCase
                    input = convertKeysToCamelCase(binding)['data'];
                } else {
                    input = fromTypedData(binding.data);
                }
            }
            bindings[binding.name] = input;
            inputs.push(input);
        }
    }

    context.bindings = bindings;
    if (httpInput) {
        context.req = httpInput;
        context.res = new Response(context.done);
        // This is added for backwards compatability with what the host used to send to the worker
        context.bindingData.sys = {
            methodName: info.name,
            utcNow: new Date().toISOString(),
            randGuid: uuid(),
        };
        // Populate from HTTP request for backwards compatibility if missing
        if (!context.bindingData.query) {
            context.bindingData.query = Object.assign({}, httpInput.query);
        }
        if (!context.bindingData.headers) {
            context.bindingData.headers = Object.assign({}, httpInput.headers);
        }
    }
    return {
        context: <Context>context,
        inputs: inputs,
        doneEmitter,
    };
}

class InvocationContext implements Context {
    invocationId: string;
    executionContext: ExecutionContext;
    bindings: ContextBindings;
    bindingData: ContextBindingData;
    traceContext: TraceContext;
    bindingDefinitions: BindingDefinition[];
    log: Logger;
    req?: Request;
    res?: Response;
    done: DoneCallback;

    constructor(
        info: FunctionInfo,
        request: rpc.IInvocationRequest,
        userLogCallback: UserLogCallback,
        doneEmitter: EventEmitter
    ) {
        this.invocationId = <string>request.invocationId;
        this.traceContext = fromRpcTraceContext(request.traceContext);
        const executionContext = <ExecutionContext>{
            invocationId: this.invocationId,
            functionName: info.name,
            functionDirectory: info.directory,
            retryContext: request.retryContext,
        };
        this.executionContext = executionContext;
        this.bindings = {};

        // Log message that is tied to function invocation
        this.log = Object.assign((...args: any[]) => userLogCallback(LogLevel.Information, ...args), {
            error: (...args: any[]) => userLogCallback(LogLevel.Error, ...args),
            warn: (...args: any[]) => userLogCallback(LogLevel.Warning, ...args),
            info: (...args: any[]) => userLogCallback(LogLevel.Information, ...args),
            verbose: (...args: any[]) => userLogCallback(LogLevel.Trace, ...args),
        });

        this.bindingData = getNormalizedBindingData(request);
        this.bindingDefinitions = getBindingDefinitions(info);

        this.done = (err?: unknown, result?: any) => {
            doneEmitter.emit('done', err, result);
        };
    }
}

export interface InvocationResult {
    return: any;
    bindings: ContextBindings;
}

export type DoneCallback = (err?: unknown, result?: any) => void;

export type UserLogCallback = (level: LogLevel, ...args: any[]) => void;

export interface Dict<T> {
    [key: string]: T;
}
