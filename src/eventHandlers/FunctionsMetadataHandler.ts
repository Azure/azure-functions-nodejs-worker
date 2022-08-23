// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { WorkerChannel } from '../WorkerChannel';
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

    async handleEvent(
        channel: WorkerChannel,
        msg: rpc.IFunctionsMetadataRequest
    ): Promise<rpc.IFunctionMetadataResponse> {
        const response = this.getDefaultResponse(msg);

        channel.log({
            message: 'Received FunctionsMetadataRequest',
            level: LogLevel.Debug,
            logCategory: LogCategory.System,
        });

        const functions = Object.values(channel.functions);
        if (functions.length > 0) {
            response.useDefaultMetadataIndexing = false;
            response.functionMetadataResults = functions.map((f) => f.metadata);
        }

        channel.hasIndexedFunctions = true;

        return response;
    }
}
