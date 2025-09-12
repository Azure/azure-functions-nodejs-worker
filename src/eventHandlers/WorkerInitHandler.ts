// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { access, constants } from 'fs';
import * as path from 'path';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { isError } from '../errors';
import { startApp } from '../startApp';
import { nonNullProp } from '../utils/nonNull';
import { validateNodeVersion } from '../utils/util';
import { worker } from '../WorkerContext';
import { EventHandler } from './EventHandler';
import { getWorkerCapabilities } from './getWorkerCapabilities';
import { getWorkerMetadata } from './getWorkerMetadata';

/**
 * Host sends capabilities/init data to worker and requests the worker to initialize itself
 */
export class WorkerInitHandler extends EventHandler<'workerInitRequest', 'workerInitResponse'> {
    readonly responseName = 'workerInitResponse';

    getDefaultResponse(_msg: rpc.IWorkerInitRequest): rpc.IWorkerInitResponse {
        return {
            workerMetadata: getWorkerMetadata(),
        };
    }

    async handleEvent(msg: rpc.IWorkerInitRequest): Promise<rpc.IWorkerInitResponse> {
        if (!msg.functionAppDirectory) {
            worker.log({
                message: `WorkerInit functionAppDirectory is not defined`,
                level: rpc.RpcLog.Level.Debug,
                logCategory: rpc.RpcLog.RpcLogCategory.System,
            });
        }
        worker.app.functionAppDirectory = msg.functionAppDirectory;

        const response = this.getDefaultResponse(msg);

        worker.log({
            message: `Worker ${worker.id} received WorkerInitRequest`,
            level: rpc.RpcLog.Level.Debug,
            logCategory: rpc.RpcLog.RpcLogCategory.System,
        });

        logColdStartWarning();

        worker._hostVersion = nonNullProp(msg, 'hostVersion');

        if (msg.functionAppDirectory) {
            await startApp(msg.functionAppDirectory);
            // model info may have changed, so we need to update this
            response.workerMetadata = getWorkerMetadata();
        }

        validateNodeVersion(process.version);
        response.capabilities = await getWorkerCapabilities();

        return response;
    }
}

export function logColdStartWarning(delayInMs?: number): void {
    // On reading a js file with function code('require') NodeJs tries to find 'package.json' all the way up to the file system root.
    // In Azure files it causes a delay during cold start as connection to Azure Files is an expensive operation.
    const scriptRoot = process.env.AzureWebJobsScriptRoot;
    if (process.env.WEBSITE_CONTENTAZUREFILECONNECTIONSTRING && process.env.WEBSITE_CONTENTSHARE && scriptRoot) {
        // Add delay to avoid affecting coldstart
        if (!delayInMs) {
            delayInMs = 5000;
        }
        setTimeout(() => {
            access(path.join(scriptRoot, 'package.json'), constants.F_OK, (err) => {
                if (isError(err)) {
                    worker.log({
                        message:
                            'package.json is not found at the root of the Function App in Azure Files - cold start for NodeJs can be affected.',
                        level: rpc.RpcLog.Level.Debug,
                        logCategory: rpc.RpcLog.RpcLogCategory.System,
                    });
                }
            });
        }, delayInMs);
    }
}
