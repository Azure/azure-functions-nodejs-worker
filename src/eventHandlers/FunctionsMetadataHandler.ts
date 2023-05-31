// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { worker } from '../WorkerContext';
import { EventHandler } from './EventHandler';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

export class FunctionsMetadataHandler extends EventHandler<'functionsMetadataRequest', 'functionMetadataResponse'> {
    readonly responseName = 'functionMetadataResponse';

    getDefaultResponse(_msg: rpc.IFunctionsMetadataRequest): rpc.IFunctionMetadataResponse {
        return {
            useDefaultMetadataIndexing: true,
        };
    }

    async handleEvent(msg: rpc.IFunctionsMetadataRequest): Promise<rpc.IFunctionMetadataResponse> {
        worker.app.workerIndexingLocked = true;

        const response = this.getDefaultResponse(msg);

        worker.log({
            message: `Worker ${worker.id} received FunctionsMetadataRequest`,
            level: LogLevel.Debug,
            logCategory: LogCategory.System,
        });

        const functions = Object.values(worker.app.functions);
        if (functions.length > 0) {
            response.useDefaultMetadataIndexing = false;
            response.functionMetadataResults = functions.map((f) => f.metadata);
        }

        return response;
    }
}
