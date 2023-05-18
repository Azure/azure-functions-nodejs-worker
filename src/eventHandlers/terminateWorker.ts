// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AppTerminateContext } from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { worker } from '../WorkerContext';
import { ReadOnlyError } from '../errors';
import { executeHooks } from '../hooks/executeHooks';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

export async function terminateWorker(_msg: rpc.IWorkerTerminate) {
    worker.log({
        message: 'Received workerTerminate message; gracefully shutting down worker',
        level: LogLevel.Debug,
        logCategory: LogCategory.System,
    });

    const appTerminateContext: AppTerminateContext = {
        get hookData() {
            return worker.app.appLevelOnlyHookData;
        },
        set hookData(_obj) {
            throw new ReadOnlyError('hookData');
        },
        get appHookData() {
            return worker.app.appHookData;
        },
        set appHookData(_obj) {
            throw new ReadOnlyError('appHookData');
        },
    };

    await executeHooks('appTerminate', appTerminateContext);

    worker.eventStream.end();
    process.exit(0);
}
