// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { startApp } from '../startApp';
import { worker } from '../WorkerContext';
import { EventHandler } from './EventHandler';
import { getWorkerCapabilities } from './getWorkerCapabilities';
import { getWorkerMetadata } from './getWorkerMetadata';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;
import CapabilitiesUpdateStrategy = rpc.FunctionEnvironmentReloadResponse.CapabilitiesUpdateStrategy;
import * as path from 'path';

/**
 * Environment variables from the current process
 */
export class FunctionEnvironmentReloadHandler extends EventHandler<
    'functionEnvironmentReloadRequest',
    'functionEnvironmentReloadResponse'
> {
    readonly responseName = 'functionEnvironmentReloadResponse';

    getDefaultResponse(_msg: rpc.IFunctionEnvironmentReloadRequest): rpc.IFunctionEnvironmentReloadResponse {
        return {
            workerMetadata: getWorkerMetadata(),
        };
    }

    async handleEvent(msg: rpc.IFunctionEnvironmentReloadRequest): Promise<rpc.IFunctionEnvironmentReloadResponse> {
        if (!msg.functionAppDirectory) {
            worker.log({
                message: `FunctionEnvironmentReload functionAppDirectory is not defined`,
                level: LogLevel.Debug,
                logCategory: LogCategory.System,
            });
        }

        if (
            worker.app.functionAppDirectory &&
            msg.functionAppDirectory &&
            isPathEqual(worker.app.functionAppDirectory, msg.functionAppDirectory)
        ) {
            worker.log({
                message: `FunctionEnvironmentReload functionAppDirectory has not changed`,
                level: LogLevel.Debug,
                logCategory: LogCategory.System,
            });
        }

        worker.resetApp(msg.functionAppDirectory);

        const response = this.getDefaultResponse(msg);

        // Add environment variables from incoming
        const numVariables = (msg.environmentVariables && Object.keys(msg.environmentVariables).length) || 0;
        worker.log({
            message: `Reloading environment variables. Found ${numVariables} variables to reload.`,
            level: LogLevel.Information,
            logCategory: LogCategory.System,
        });

        // reset existing env vars
        Object.keys(process.env).map((key) => delete process.env[key]);
        // set new env vars
        Object.assign(process.env, msg.environmentVariables);

        // Change current working directory
        if (msg.functionAppDirectory) {
            worker.log({
                message: `Changing current working directory to ${msg.functionAppDirectory}`,
                level: LogLevel.Information,
                logCategory: LogCategory.System,
            });
            process.chdir(msg.functionAppDirectory);
            await startApp(msg.functionAppDirectory);
            // model info may have changed, so we need to update this
            response.workerMetadata = getWorkerMetadata();
        }

        response.capabilities = await getWorkerCapabilities();
        response.capabilitiesUpdateStrategy = CapabilitiesUpdateStrategy.replace;

        return response;
    }
}

function isPathEqual(path1: string, path2: string): boolean {
    return path.relative(path1, path2) === '';
}
