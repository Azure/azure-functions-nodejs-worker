// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as coreTypes from '@azure/functions-core';
import {
    HookData,
    InvocationState,
    PostInvocationContext,
    PreInvocationContext,
    ProgrammingModel,
    RpcFunctionMetadata,
    RpcInvocationRequest,
    RpcLogCategory,
    RpcLogLevel,
} from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { fromCoreInvocationResponse } from '../coreApi/converters/fromCoreInvocationResponse';
import { fromCoreLogCategory, fromCoreLogLevel } from '../coreApi/converters/fromCoreStatusResult';
import { toCoreFunctionMetadata } from '../coreApi/converters/toCoreFunctionMetadata';
import { toCoreInvocationRequest } from '../coreApi/converters/toCoreInvocationRequest';
import { isError } from '../utils/ensureErrorType';
import { nonNullProp } from '../utils/nonNull';
import { ReadOnlyError } from '../utils/ReadOnlyError';
import { WorkerChannel } from '../WorkerChannel';
import { EventHandler } from './EventHandler';

/**
 * Host requests worker to invoke a Function
 */
export class InvocationHandler extends EventHandler<'invocationRequest', 'invocationResponse'> {
    readonly responseName = 'invocationResponse';

    getDefaultResponse(msg: rpc.IInvocationRequest): rpc.IInvocationResponse {
        return { invocationId: msg.invocationId };
    }

    async handleEvent(channel: WorkerChannel, msg: rpc.IInvocationRequest): Promise<rpc.IInvocationResponse> {
        const functionId = nonNullProp(msg, 'functionId');
        let { metadata, callback } =
            channel.functions[functionId] || channel.legacyFunctionLoader.getFunction(functionId);
        const msgCategory = `${nonNullProp(metadata, 'name')}.Invocation`;
        const coreCtx = new CoreInvocationContext(
            channel,
            toCoreInvocationRequest(msg),
            toCoreFunctionMetadata(metadata),
            msgCategory
        );

        // Log invocation details to ensure the invocation received by node worker
        coreCtx.log('debug', 'system', 'Received FunctionInvocationRequest');

        const programmingModel: ProgrammingModel = nonNullProp(channel, 'programmingModel');
        const invocModel = programmingModel.getInvocationModel(coreCtx);

        const hookData: HookData = {};
        let { context, inputs } = await invocModel.getArguments();

        const preInvocContext: PreInvocationContext = {
            get hookData() {
                return hookData;
            },
            set hookData(_obj) {
                throw new ReadOnlyError('hookData');
            },
            get appHookData() {
                return channel.appHookData;
            },
            set appHookData(_obj) {
                throw new ReadOnlyError('appHookData');
            },
            invocationContext: context,
            functionCallback: callback,
            inputs,
        };

        coreCtx.state = 'preInvocationHooks';
        try {
            await channel.executeHooks('preInvocation', preInvocContext, msg.invocationId, msgCategory);
        } finally {
            coreCtx.state = undefined;
        }

        inputs = preInvocContext.inputs;
        callback = preInvocContext.functionCallback;

        const postInvocContext: PostInvocationContext = {
            get hookData() {
                return hookData;
            },
            set hookData(_obj) {
                throw new ReadOnlyError('hookData');
            },
            get appHookData() {
                return channel.appHookData;
            },
            set appHookData(_obj) {
                throw new ReadOnlyError('appHookData');
            },
            invocationContext: context,
            inputs,
            result: null,
            error: null,
        };

        coreCtx.state = 'invocation';
        try {
            postInvocContext.result = await invocModel.invokeFunction(context, inputs, callback);
        } catch (err) {
            postInvocContext.error = err;
        } finally {
            coreCtx.state = undefined;
        }

        coreCtx.state = 'postInvocationHooks';
        try {
            await channel.executeHooks('postInvocation', postInvocContext, msg.invocationId, msgCategory);
        } finally {
            coreCtx.state = undefined;
        }

        if (isError(postInvocContext.error)) {
            throw postInvocContext.error;
        }

        return fromCoreInvocationResponse(await invocModel.getResponse(context, postInvocContext.result));
    }
}

class CoreInvocationContext implements coreTypes.CoreInvocationContext {
    invocationId: string;
    request: RpcInvocationRequest;
    metadata: RpcFunctionMetadata;
    state?: InvocationState;
    #channel: WorkerChannel;
    #msgCategory: string;

    constructor(
        channel: WorkerChannel,
        request: RpcInvocationRequest,
        metadata: RpcFunctionMetadata,
        msgCategory: string
    ) {
        this.invocationId = nonNullProp(request, 'invocationId');
        this.#channel = channel;
        this.request = request;
        this.metadata = metadata;
        this.#msgCategory = msgCategory;
    }

    log(level: RpcLogLevel, logCategory: RpcLogCategory, message: string): void {
        this.#channel.log({
            invocationId: this.request.invocationId,
            category: this.#msgCategory,
            message,
            level: fromCoreLogLevel(level),
            logCategory: fromCoreLogCategory(logCategory),
        });
    }
}
