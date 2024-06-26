// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { AzFuncSystemError, ensureErrorType } from './errors';
import { EventHandler, SupportedRequest } from './eventHandlers/EventHandler';
import { FunctionEnvironmentReloadHandler } from './eventHandlers/FunctionEnvironmentReloadHandler';
import { FunctionLoadHandler } from './eventHandlers/FunctionLoadHandler';
import { FunctionsMetadataHandler } from './eventHandlers/FunctionsMetadataHandler';
import { InvocationHandler } from './eventHandlers/InvocationHandler';
import { terminateWorker } from './eventHandlers/terminateWorker';
import { WorkerInitHandler } from './eventHandlers/WorkerInitHandler';
import { systemError } from './utils/Logger';
import { nonNullProp } from './utils/nonNull';
import { worker } from './WorkerContext';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

/**
 * Configures handlers for incoming gRPC messages on the client
 *
 * This should have a way to handle all incoming gRPC messages.
 * This includes all incoming StreamingMessage types (exclude *Response types and RpcLog type)
 */
export function setupEventStream(): void {
    worker.eventStream.on('data', (msg) => {
        void handleMessage(msg);
    });

    worker.eventStream.on('error', function (err) {
        systemError(`Worker encountered event stream error: `, err);
        throw new AzFuncSystemError(err);
    });

    // wrap event stream write to validate message correctness
    const oldWrite = worker.eventStream.write;
    worker.eventStream.write = function checkWrite(msg) {
        const msgError = rpc.StreamingMessage.verify(msg);
        if (msgError) {
            systemError(`Worker malformed message`, msgError);
            throw new AzFuncSystemError(msgError);
        }
        oldWrite.apply(worker.eventStream, [msg]);
    };
}

async function handleMessage(inMsg: rpc.StreamingMessage): Promise<void> {
    const outMsg: rpc.IStreamingMessage = {
        requestId: inMsg.requestId,
    };

    let eventHandler: EventHandler | undefined;
    let request: SupportedRequest | undefined;
    try {
        const eventName = inMsg.content;
        switch (eventName) {
            case 'functionEnvironmentReloadRequest':
                eventHandler = new FunctionEnvironmentReloadHandler();
                break;
            case 'functionLoadRequest':
                eventHandler = new FunctionLoadHandler();
                break;
            case 'invocationRequest':
                eventHandler = new InvocationHandler();
                break;
            case 'workerInitRequest':
                eventHandler = new WorkerInitHandler();
                break;
            case 'workerTerminate':
                // Worker terminate request is a special request which gracefully shuts down worker
                // It doesn't have a response so we don't have an EventHandler class for it
                await terminateWorker(nonNullProp(inMsg, eventName));
                return;
            case 'workerStatusRequest':
                // Worker sends the host empty response to evaluate the worker's latency
                // The response doesn't even allow a `result` property, which is why we don't implement an EventHandler class
                outMsg.workerStatusResponse = {};
                worker.eventStream.write(outMsg);
                return;
            case 'functionsMetadataRequest':
                eventHandler = new FunctionsMetadataHandler();
                break;
            case 'closeSharedMemoryResourcesRequest':
            case 'fileChangeEventRequest':
            case 'functionLoadRequestCollection':
            case 'invocationCancel':
            case 'startStream':
            case 'workerHeartbeat':
                // Not yet implemented
                return;
            default:
                throw new AzFuncSystemError(`Worker had no handler for message '${eventName}'`);
        }

        request = nonNullProp(inMsg, eventName);
        const response = await eventHandler.handleEvent(request);
        response.result = { status: rpc.StatusResult.Status.Success };
        outMsg[eventHandler.responseName] = response;
    } catch (err) {
        const error = ensureErrorType(err);
        if (error.isAzureFunctionsSystemError && !error.loggedOverRpc) {
            worker.log({
                message: error.message,
                level: LogLevel.Error,
                logCategory: LogCategory.System,
            });
        }

        if (eventHandler && request) {
            const response = eventHandler.getDefaultResponse(request);
            response.result = {
                status: rpc.StatusResult.Status.Failure,
                exception: {
                    message: error.message,
                    stackTrace: error.stack,
                },
            };
            outMsg[eventHandler.responseName] = response;
        }
    }

    if (eventHandler) {
        worker.eventStream.write(outMsg);
    }
}
