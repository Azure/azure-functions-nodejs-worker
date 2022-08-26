// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AppTerminateContext } from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { ReadOnlyError } from '../utils/ReadOnlyError';
import { WorkerChannel } from '../WorkerChannel';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

export async function terminateWorker(channel: WorkerChannel, msg: rpc.IWorkerTerminate) {
    channel.log({
        message: 'Received workerTerminate message; gracefully shutting down worker',
        level: LogLevel.Debug,
        logCategory: LogCategory.System,
    });

    const appTerminateContext: AppTerminateContext = {
        get hookData() {
            return channel.appLevelOnlyHookData;
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
    };

    await channel.executeHooks('appTerminate', appTerminateContext);

    channel.eventStream.end();
    process.exit(0);
}
