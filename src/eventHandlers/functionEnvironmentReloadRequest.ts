// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { toRpcStatus } from '../utils/toRpcStatus';
import { WorkerChannel } from '../WorkerChannel';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

/**
 * Environment variables from the current process
 */
export async function functionEnvironmentReloadRequest(
    channel: WorkerChannel,
    requestId: string,
    msg: rpc.IFunctionEnvironmentReloadRequest
): Promise<void> {
    // Add environment variables from incoming
    const numVariables = (msg.environmentVariables && Object.keys(msg.environmentVariables).length) || 0;
    channel.log({
        message: `Reloading environment variables. Found ${numVariables} variables to reload.`,
        level: LogLevel.Information,
        logCategory: LogCategory.System,
    });

    let error: unknown;
    try {
        process.env = Object.assign({}, msg.environmentVariables);
        // Change current working directory
        if (msg.functionAppDirectory) {
            channel.log({
                message: `Changing current working directory to ${msg.functionAppDirectory}`,
                level: LogLevel.Information,
                logCategory: LogCategory.System,
            });
            process.chdir(msg.functionAppDirectory);
            await channel.initAppDir(msg.functionAppDirectory);
        }
    } catch (err) {
        error = err;
    }

    const functionEnvironmentReloadResponse: rpc.IFunctionEnvironmentReloadResponse = {
        result: toRpcStatus(error),
    };

    channel.eventStream.write({
        requestId: requestId,
        functionEnvironmentReloadResponse,
    });
}
