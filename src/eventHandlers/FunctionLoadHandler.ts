// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { ensureErrorType } from '../errors';
import { nonNullProp } from '../utils/nonNull';
import { WorkerChannel } from '../WorkerChannel';
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

    async handleEvent(channel: WorkerChannel, msg: rpc.IFunctionLoadRequest): Promise<rpc.IFunctionLoadResponse> {
        channel.workerIndexingLocked = true;

        const response = this.getDefaultResponse(msg);

        channel.log({
            message: `Worker ${channel.workerId} received FunctionLoadRequest`,
            level: LogLevel.Debug,
            logCategory: LogCategory.System,
        });

        if (!channel.isUsingWorkerIndexing) {
            const functionId = nonNullProp(msg, 'functionId');
            const metadata = nonNullProp(msg, 'metadata');
            try {
                await channel.legacyFunctionLoader.load(functionId, metadata, channel.packageJson);
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
