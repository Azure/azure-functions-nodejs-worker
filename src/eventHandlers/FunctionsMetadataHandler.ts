// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { isDefined } from '../utils/nonNull';
import { worker } from '../WorkerContext';
import { EventHandler } from './EventHandler';

export class FunctionsMetadataHandler extends EventHandler<'functionsMetadataRequest', 'functionMetadataResponse'> {
    readonly responseName = 'functionMetadataResponse';

    getDefaultResponse(_msg: rpc.IFunctionsMetadataRequest): rpc.IFunctionMetadataResponse {
        return {
            useDefaultMetadataIndexing: !worker.app.isUsingWorkerIndexing,
        };
    }

    async handleEvent(msg: rpc.IFunctionsMetadataRequest): Promise<rpc.IFunctionMetadataResponse> {
        worker.app.workerIndexingLocked = true;

        const response = this.getDefaultResponse(msg);

        worker.log({
            message: `Worker ${worker.id} received FunctionsMetadataRequest`,
            level: rpc.RpcLog.Level.Debug,
            logCategory: rpc.RpcLog.RpcLogCategory.System,
        });

        if (worker.app.isUsingWorkerIndexing) {
            if (isDefined(worker.app.blockingAppStartError)) {
                throw worker.app.blockingAppStartError;
            }

            response.functionMetadataResults = Object.values(worker.app.functions).map((f) => f.metadata);
        }

        return response;
    }
}
