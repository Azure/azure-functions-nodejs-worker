// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { loadLegacyFunction } from '../LegacyFunctionLoader';
import { channel } from '../WorkerChannel';
import { ensureErrorType } from '../errors';
import { nonNullProp } from '../utils/nonNull';
import { EventHandler } from './EventHandler';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

/**
 * Worker responds after loading required metadata to load function with the load result
 */
export class FunctionLoadHandler extends EventHandler<'functionLoadRequest', 'functionLoadResponse'> {
    readonly responseName = 'functionLoadResponse';

    getDefaultResponse(msg: rpc.IFunctionLoadRequest): rpc.IFunctionLoadResponse {
        return { functionId: msg.functionId };
    }

    async handleEvent(msg: rpc.IFunctionLoadRequest): Promise<rpc.IFunctionLoadResponse> {
        channel.app.workerIndexingLocked = true;

        const response = this.getDefaultResponse(msg);

        channel.log({
            message: `Worker ${channel.workerId} received FunctionLoadRequest`,
            level: LogLevel.Debug,
            logCategory: LogCategory.System,
        });

        if (!channel.app.isUsingWorkerIndexing) {
            const functionId = nonNullProp(msg, 'functionId');
            const metadata = nonNullProp(msg, 'metadata');
            try {
                await loadLegacyFunction(functionId, metadata, channel.app.packageJson);
            } catch (err) {
                const error = ensureErrorType(err);
                error.isAzureFunctionsSystemError = true;
                error.message = `Worker was unable to load function ${metadata.name}: '${error.message}'`;
                throw error;
            }
        }

        return response;
    }
}
