// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { startApp } from '../startApp';
import { worker } from '../WorkerContext';
import { EventHandler } from './EventHandler';
import { getWorkerCapabilities } from './getWorkerCapabilities';
import { getWorkerMetadata } from './getWorkerMetadata';
import CapabilitiesUpdateStrategy = rpc.FunctionEnvironmentReloadResponse.CapabilitiesUpdateStrategy;
import * as path from 'path';
import { validateNodeVersion } from '../utils/util';

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
                level: rpc.RpcLog.Level.Debug,
                logCategory: rpc.RpcLog.RpcLogCategory.System,
            });
        }

        if (
            worker.app.functionAppDirectory &&
            msg.functionAppDirectory &&
            isPathEqual(worker.app.functionAppDirectory, msg.functionAppDirectory)
        ) {
            worker.log({
                message: `FunctionEnvironmentReload functionAppDirectory has not changed`,
                level: rpc.RpcLog.Level.Debug,
                logCategory: rpc.RpcLog.RpcLogCategory.System,
            });
        }

        worker.resetApp(msg.functionAppDirectory);

        const response = this.getDefaultResponse(msg);

        // Add environment variables from incoming
        const numVariables = (msg.environmentVariables && Object.keys(msg.environmentVariables).length) || 0;
        worker.log({
            message: `Reloading environment variables. Found ${numVariables} variables to reload.`,
            level: rpc.RpcLog.Level.Information,
            logCategory: rpc.RpcLog.RpcLogCategory.System,
        });

        // reset existing env vars
        Object.keys(process.env).map((key) => delete process.env[key]);
        // set new env vars
        Object.assign(process.env, msg.environmentVariables);

        // Change current working directory
        if (msg.functionAppDirectory) {
            worker.log({
                message: `Changing current working directory to ${msg.functionAppDirectory}`,
                level: rpc.RpcLog.Level.Information,
                logCategory: rpc.RpcLog.RpcLogCategory.System,
            });
            process.chdir(msg.functionAppDirectory);
            await startApp(msg.functionAppDirectory);
            // model info may have changed, so we need to update this
            response.workerMetadata = getWorkerMetadata();
        }

        validateNodeVersion(process.version);
        response.capabilities = await getWorkerCapabilities();
        response.capabilitiesUpdateStrategy = CapabilitiesUpdateStrategy.replace;

        return response;
    }
}

function isPathEqual(path1: string, path2: string): boolean {
    return path.relative(path1, path2) === '';
}
