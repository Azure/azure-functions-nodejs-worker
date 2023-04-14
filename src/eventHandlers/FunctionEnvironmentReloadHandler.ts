// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { startApp } from '../startApp';
import { WorkerChannel } from '../WorkerChannel';
import { EventHandler } from './EventHandler';
import { getWorkerMetadata } from './getWorkerMetadata';
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

    getDefaultResponse(
        channel: WorkerChannel,
        _msg: rpc.IFunctionEnvironmentReloadRequest
    ): rpc.IFunctionEnvironmentReloadResponse {
        return {
            workerMetadata: getWorkerMetadata(channel),
        };
    }

    async handleEvent(
        channel: WorkerChannel,
        msg: rpc.IFunctionEnvironmentReloadRequest
    ): Promise<rpc.IFunctionEnvironmentReloadResponse> {
        channel.resetApp();

        const response = this.getDefaultResponse(channel, msg);

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
            await startApp(msg.functionAppDirectory, channel);
            // model info may have changed, so we need to update this
            response.workerMetadata = getWorkerMetadata(channel);
        }

        return response;
    }
}
