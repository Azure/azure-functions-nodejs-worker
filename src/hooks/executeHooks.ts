// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { HookContext } from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { worker } from '../WorkerContext';
import { getHooks } from './getHooks';

export async function executeHooks(
    hookName: string,
    context: HookContext,
    invocationId?: string | null,
    msgCategory?: string
): Promise<void> {
    const callbacks = getHooks(hookName);
    if (callbacks.length > 0) {
        worker.log({
            message: `Executing ${callbacks.length} "${hookName}" hooks`,
            level: rpc.RpcLog.Level.Debug,
            logCategory: rpc.RpcLog.RpcLogCategory.System,
            invocationId,
            category: msgCategory,
        });
        for (const callback of callbacks) {
            await callback(context);
        }
        worker.log({
            message: `Executed "${hookName}" hooks`,
            level: rpc.RpcLog.Level.Debug,
            logCategory: rpc.RpcLog.RpcLogCategory.System,
            invocationId,
            category: msgCategory,
        });
    }
}
