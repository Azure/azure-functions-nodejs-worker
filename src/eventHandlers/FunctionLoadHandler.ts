// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { ensureErrorType, trySetErrorMessage } from '../errors';
import { loadLegacyFunction } from '../LegacyFunctionLoader';
import { isDefined, nonNullProp } from '../utils/nonNull';
import { worker } from '../WorkerContext';
import { EventHandler } from './EventHandler';

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
            level: rpc.RpcLog.Level.Debug,
            logCategory: rpc.RpcLog.RpcLogCategory.System,
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
                const message = `Worker was unable to load function ${metadata.name}: '${error.message}'`;
                trySetErrorMessage(error, message);
                throw error;
            }
        }

        return response;
    }
}
