// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { ensureErrorType } from '../utils/ensureErrorType';
import { toRpcStatus } from '../utils/toRpcStatus';
import { WorkerChannel } from '../WorkerChannel';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

/**
 * Worker responds after loading required metadata to load function with the load result
 * @param requestId gRPC message request id
 * @param msg gRPC message content
 */
export async function functionLoadRequest(channel: WorkerChannel, requestId: string, msg: rpc.IFunctionLoadRequest) {
    if (msg.functionId && msg.metadata) {
        let error: Error | null | undefined;
        let errorMessage: string | undefined;
        try {
            await channel.functionLoader.load(msg.functionId, msg.metadata);
        } catch (err) {
            error = ensureErrorType(err);
            errorMessage = `Worker was unable to load function ${msg.metadata.name}: '${error.message}'`;
            channel.log({
                message: errorMessage,
                level: LogLevel.Error,
                logCategory: LogCategory.System,
            });
        }

        channel.eventStream.write({
            requestId: requestId,
            functionLoadResponse: {
                functionId: msg.functionId,
                result: toRpcStatus(error, errorMessage),
            },
        });
    }
}
