// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { access, constants } from 'fs';
import { pathExists } from 'fs-extra';
import * as path from 'path';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { loadScriptFile } from '../loadScriptFile';
import { ensureErrorType, isError } from '../utils/ensureErrorType';
import { InternalException } from '../utils/InternalException';
import { systemError } from '../utils/Logger';
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
        return {};
    }

    async handleEvent(channel: WorkerChannel, msg: rpc.IWorkerInitRequest): Promise<rpc.IWorkerInitResponse> {
        const response = this.getDefaultResponse(msg);

        channel.log({
            message: 'Received WorkerInitRequest',
            level: LogLevel.Debug,
            logCategory: LogCategory.System,
        });

        // Validate version
        const version = process.version;
        if (
            (version.startsWith('v17.') || version.startsWith('v15.')) &&
            process.env.AZURE_FUNCTIONS_ENVIRONMENT == 'Development'
        ) {
            const msg =
                'Node.js version used (' +
                version +
                ') is not officially supported. You may use it during local development, but must use an officially supported version on Azure:' +
                ' https://aka.ms/functions-node-versions';
            channel.log({
                message: msg,
                level: LogLevel.Warning,
                logCategory: LogCategory.System,
            });
        } else if (!(version.startsWith('v14.') || version.startsWith('v16.'))) {
            const errorMsg =
                'Incompatible Node.js version' +
                ' (' +
                version +
                ').' +
                ' The version of the Azure Functions runtime you are using (v4) supports Node.js v14.x or Node.js v16.x' +
                ' Refer to our documentation to see the Node.js versions supported by each version of Azure Functions: https://aka.ms/functions-node-versions';
            systemError(errorMsg);
            throw new InternalException(errorMsg);
        }

        logColdStartWarning(channel);
        const functionAppDirectory = nonNullProp(msg, 'functionAppDirectory');
        await channel.updatePackageJson(functionAppDirectory);

        const entryPointFile = channel.packageJson.main;
        if (entryPointFile) {
            channel.log({
                message: `Loading entry point "${entryPointFile}"`,
                level: LogLevel.Debug,
                logCategory: LogCategory.System,
            });
            try {
                const entryPointFullPath = path.join(functionAppDirectory, entryPointFile);
                if (!(await pathExists(entryPointFullPath))) {
                    throw new Error(`file does not exist`);
                }

                await loadScriptFile(entryPointFullPath, channel.packageJson);
                channel.log({
                    message: `Loaded entry point "${entryPointFile}"`,
                    level: LogLevel.Debug,
                    logCategory: LogCategory.System,
                });
            } catch (err) {
                const error = ensureErrorType(err);
                error.isAzureFunctionsInternalException = true;
                error.message = `Worker was unable to load entry point "${entryPointFile}": ${error.message}`;
                throw error;
            }
        }

        response.capabilities = {
            RpcHttpTriggerMetadataRemoved: 'true',
            RpcHttpBodyOnly: 'true',
            IgnoreEmptyValuedRpcHttpHeaders: 'true',
            UseNullableValueDictionaryForHttp: 'true',
            WorkerStatus: 'true',
            TypedDataCollection: 'true',
        };

        return response;
    }
}

export function logColdStartWarning(channel: WorkerChannel, delayInMs?: number): void {
    // On reading a js file with function code('require') NodeJs tries to find 'package.json' all the way up to the file system root.
    // In Azure files it causes a delay during cold start as connection to Azure Files is an expensive operation.
    if (
        process.env.WEBSITE_CONTENTAZUREFILECONNECTIONSTRING &&
        process.env.WEBSITE_CONTENTSHARE &&
        process.env.AzureWebJobsScriptRoot
    ) {
        // Add delay to avoid affecting coldstart
        if (!delayInMs) {
            delayInMs = 5000;
        }
        setTimeout(() => {
            access(path.join(process.env.AzureWebJobsScriptRoot!, 'package.json'), constants.F_OK, (err) => {
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
