// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { functionEnvironmentReloadRequest } from './eventHandlers/functionEnvironmentReloadRequest';
import { functionLoadRequest } from './eventHandlers/functionLoadRequest';
import { invocationRequest } from './eventHandlers/invocationRequest';
import { workerInitRequest } from './eventHandlers/workerInitRequest';
import { workerStatusRequest } from './eventHandlers/workerStatusRequest';
import { InternalException } from './utils/InternalException';
import { systemError } from './utils/Logger';
import { nonNullProp } from './utils/nonNull';
import { WorkerChannel } from './WorkerChannel';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

/**
 * Configures handlers for incoming gRPC messages on the client
 *
 * This should have a way to handle all incoming gRPC messages.
 * This includes all incoming StreamingMessage types (exclude *Response types and RpcLog type)
 */
export function setupEventStream(workerId: string, channel: WorkerChannel): void {
    channel.eventStream.on('data', (msg) => {
        const eventName = msg.content;
        switch (eventName) {
            case 'functionEnvironmentReloadRequest':
                functionEnvironmentReloadRequest(channel, msg.requestId, nonNullProp(msg, eventName));
                break;
            case 'functionLoadRequest':
                void functionLoadRequest(channel, msg.requestId, nonNullProp(msg, eventName));
                break;
            case 'invocationRequest':
                void invocationRequest(channel, msg.requestId, nonNullProp(msg, eventName));
                break;
            case 'workerInitRequest':
                workerInitRequest(channel, msg.requestId, nonNullProp(msg, eventName));
                break;
            case 'workerStatusRequest':
                workerStatusRequest(channel, msg.requestId, nonNullProp(msg, eventName));
                break;
            case 'closeSharedMemoryResourcesRequest':
            case 'fileChangeEventRequest':
            case 'functionLoadRequestCollection':
            case 'functionsMetadataRequest':
            case 'invocationCancel':
            case 'startStream':
            case 'workerHeartbeat':
            case 'workerTerminate':
                // Not yet implemented
                break;
            default:
                channel.log({
                    message: `Worker ${workerId} had no handler for message '${eventName}'`,
                    level: LogLevel.Error,
                    logCategory: LogCategory.System,
                });
        }
    });

    channel.eventStream.on('error', function (err) {
        systemError(`Worker ${workerId} encountered event stream error: `, err);
        throw new InternalException(err);
    });

    // wrap event stream write to validate message correctness
    const oldWrite = channel.eventStream.write;
    channel.eventStream.write = function checkWrite(msg) {
        const msgError = rpc.StreamingMessage.verify(msg);
        if (msgError) {
            systemError(`Worker ${workerId} malformed message`, msgError);
            throw new InternalException(msgError);
        }
        oldWrite.apply(channel.eventStream, [msg]);
    };
}
