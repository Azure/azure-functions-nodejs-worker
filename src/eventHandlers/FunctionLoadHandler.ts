// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { ensureErrorType } from '../errors';
import { loadLegacyFunction } from '../LegacyFunctionLoader';
import { isDefined, nonNullProp } from '../utils/nonNull';
import { worker } from '../WorkerContext';
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
        worker.app.workerIndexingLocked = true;

        const response = this.getDefaultResponse(msg);

        worker.log({
            message: `Worker ${worker.id} received FunctionLoadRequest`,
            level: LogLevel.Debug,
            logCategory: LogCategory.System,
        });

        if (isDefined(worker.app.blockingAppStartError)) {
            throw worker.app.blockingAppStartError;
        }

        if (!worker.app.isUsingWorkerIndexing) {
            const functionId = nonNullProp(msg, 'functionId');
            const metadata = nonNullProp(msg, 'metadata');
            try {
                await loadLegacyFunction(functionId, metadata, worker.app.packageJson);
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
