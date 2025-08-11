// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AppTerminateContext } from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { ReadOnlyError } from '../errors';
import { executeHooks } from '../hooks/executeHooks';
import { worker } from '../WorkerContext';

export async function terminateWorker(_msg: rpc.IWorkerTerminate) {
    worker.log({
        message: 'Received workerTerminate message; gracefully shutting down worker',
        level: rpc.RpcLog.Level.Debug,
        logCategory: rpc.RpcLog.RpcLogCategory.System,
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
