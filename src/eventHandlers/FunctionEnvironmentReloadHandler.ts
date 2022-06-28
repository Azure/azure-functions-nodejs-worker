// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { WorkerChannel } from '../WorkerChannel';
import { EventHandler } from './EventHandler';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

/**
 * Environment variables from the current process
 */
export class FunctionEnvironmentReloadHandler extends EventHandler<
    'functionEnvironmentReloadRequest',
    'functionEnvironmentReloadResponse'
> {
    readonly responseName = 'functionEnvironmentReloadResponse';

    getDefaultResponse(_msg: rpc.IFunctionEnvironmentReloadRequest): rpc.IFunctionEnvironmentReloadResponse {
        return {};
    }

    async handleEvent(
        channel: WorkerChannel,
        msg: rpc.IFunctionEnvironmentReloadRequest
    ): Promise<rpc.IFunctionEnvironmentReloadResponse> {
        const response = this.getDefaultResponse(msg);

        // Add environment variables from incoming
        const numVariables = (msg.environmentVariables && Object.keys(msg.environmentVariables).length) || 0;
        channel.log({
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
            channel.log({
                message: `Changing current working directory to ${msg.functionAppDirectory}`,
                level: LogLevel.Information,
                logCategory: LogCategory.System,
            });
            process.chdir(msg.functionAppDirectory);
            await channel.updatePackageJson(msg.functionAppDirectory);
        }

        return response;
    }
}
