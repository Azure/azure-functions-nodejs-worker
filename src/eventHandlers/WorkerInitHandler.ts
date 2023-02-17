// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { access, constants } from 'fs';
import * as path from 'path';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { version as workerVersion } from '../constants';
import { isError } from '../errors';
import { startApp } from '../startApp';
import { nonNullProp } from '../utils/nonNull';
import { WorkerChannel } from '../WorkerChannel';
import { EventHandler } from './EventHandler';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

/**
 * Host sends capabilities/init data to worker and requests the worker to initialize itself
 */
export class WorkerInitHandler extends EventHandler<'workerInitRequest', 'workerInitResponse'> {
    readonly responseName = 'workerInitResponse';

    getDefaultResponse(_msg: rpc.IWorkerInitRequest): rpc.IWorkerInitResponse {
        return {
            workerMetadata: {
                runtimeName: 'node',
                runtimeVersion: process.versions.node,
                workerBitness: process.arch,
                workerVersion,
            },
        };
    }

    async handleEvent(channel: WorkerChannel, msg: rpc.IWorkerInitRequest): Promise<rpc.IWorkerInitResponse> {
        const response = this.getDefaultResponse(msg);

        channel.log({
            message: `Worker ${channel.workerId} received WorkerInitRequest`,
            level: LogLevel.Debug,
            logCategory: LogCategory.System,
        });

        logColdStartWarning(channel);

        channel._hostVersion = nonNullProp(msg, 'hostVersion');

        if (msg.functionAppDirectory) {
            await startApp(msg.functionAppDirectory, channel);
        }

        response.capabilities = {
            RawHttpBodyBytes: 'true',
            RpcHttpTriggerMetadataRemoved: 'true',
            RpcHttpBodyOnly: 'true',
            IgnoreEmptyValuedRpcHttpHeaders: 'true',
            UseNullableValueDictionaryForHttp: 'true',
            WorkerStatus: 'true',
            TypedDataCollection: 'true',
            HandlesWorkerTerminateMessage: 'true',
        };

        return response;
    }
}

export function logColdStartWarning(channel: WorkerChannel, delayInMs?: number): void {
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
                    channel.log({
                        message:
                            'package.json is not found at the root of the Function App in Azure Files - cold start for NodeJs can be affected.',
                        level: LogLevel.Debug,
                        logCategory: LogCategory.System,
                    });
                }
            });
        }, delayInMs);
    }
}
