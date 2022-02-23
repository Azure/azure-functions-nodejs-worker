// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { Context } from '@azure/functions';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { functionEnvironmentReloadRequest } from './eventHandlers/functionEnvironmentReloadRequest';
import { functionLoadRequest } from './eventHandlers/functionLoadRequest';
import { invocationRequest } from './eventHandlers/invocationRequest';
import { workerInitRequest } from './eventHandlers/workerInitRequest';
import { workerStatusRequest } from './eventHandlers/workerStatusRequest';
import { IFunctionLoader } from './FunctionLoader';
import { IEventStream } from './GrpcClient';
import { InternalException } from './utils/InternalException';
import { systemError } from './utils/Logger';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

type InvocationRequestBefore = (context: Context, userFn: Function) => Function;
type InvocationRequestAfter = (context: Context) => void;

/**
 * Initializes handlers for incoming gRPC messages on the client
 *
 * The worker channel should have a way to handle all incoming gRPC messages.
 * This includes all incoming StreamingMessage types (exclude *Response types and RpcLog type)
 */
export class WorkerChannel {
    public eventStream: IEventStream;
    public functionLoader: IFunctionLoader;
    private _invocationRequestBefore: InvocationRequestBefore[];
    private _invocationRequestAfter: InvocationRequestAfter[];

    constructor(workerId: string, eventStream: IEventStream, functionLoader: IFunctionLoader) {
        this.eventStream = eventStream;
        this.functionLoader = functionLoader;
        this._invocationRequestBefore = [];
        this._invocationRequestAfter = [];

        // call the method with the matching 'event' name on this class, passing the requestId and event message
        eventStream.on('data', (msg) => {
            const event = <string>msg.content;
            const eventHandler = (<any>this)[event];
            if (eventHandler) {
                eventHandler.apply(this, [msg.requestId, msg[event]]);
            } else {
                this.log({
                    message: `Worker ${workerId} had no handler for message '${event}'`,
                    level: LogLevel.Error,
                    logCategory: LogCategory.System,
                });
            }
        });
        eventStream.on('error', function (err) {
            systemError(`Worker ${workerId} encountered event stream error: `, err);
            throw new InternalException(err);
        });

        // wrap event stream write to validate message correctness
        const oldWrite = eventStream.write;
        eventStream.write = function checkWrite(msg) {
            const msgError = rpc.StreamingMessage.verify(msg);
            if (msgError) {
                systemError(`Worker ${workerId} malformed message`, msgError);
                throw new InternalException(msgError);
            }
            oldWrite.apply(eventStream, [msg]);
        };
    }

    /**
     * Captured logs or relevant details can use the logs property
     * @param requestId gRPC message request id
     * @param msg gRPC message content
     */
    public log(log: rpc.IRpcLog) {
        this.eventStream.write({
            rpcLog: log,
        });
    }

    /**
     * Register a patching function to be run before User Function is executed.
     * Hook should return a patched version of User Function.
     */
    public registerBeforeInvocationRequest(beforeCb: InvocationRequestBefore): void {
        this._invocationRequestBefore.push(beforeCb);
    }

    /**
     * Register a function to be run after User Function resolves.
     */
    public registerAfterInvocationRequest(afterCb: InvocationRequestAfter): void {
        this._invocationRequestAfter.push(afterCb);
    }

    /**
     * Host sends capabilities/init data to worker and requests the worker to initialize itself
     * @param requestId gRPC message request id
     * @param msg gRPC message content
     */
    public workerInitRequest(requestId: string, _msg: rpc.WorkerInitRequest) {
        workerInitRequest(this, requestId, _msg);
    }

    /**
     * Worker responds after loading required metadata to load function with the load result
     * @param requestId gRPC message request id
     * @param msg gRPC message content
     */
    public async functionLoadRequest(requestId: string, msg: rpc.FunctionLoadRequest) {
        await functionLoadRequest(this, requestId, msg);
    }

    /**
     * Host requests worker to invoke a Function
     * @param requestId gRPC message request id
     * @param msg gRPC message content
     */
    public invocationRequest(requestId: string, msg: rpc.InvocationRequest) {
        invocationRequest(this, requestId, msg);
    }

    /**
     * Worker sends the host information identifying itself
     */
    public startStream(_requestId: string, _msg: rpc.StartStream): void {
        // Not yet implemented
    }

    /**
     * Message is empty by design - Will add more fields in future if needed
     */
    public workerHeartbeat(_requestId: string, _msg: rpc.WorkerHeartbeat): void {
        // Not yet implemented
    }

    /**
     * Warning before killing the process after grace_period
     * Worker self terminates ..no response on this
     */
    public workerTerminate(_requestId: string, _msg: rpc.WorkerTerminate): void {
        // Not yet implemented
    }

    /**
     * Worker sends the host empty response to evaluate the worker's latency
     */
    public workerStatusRequest(requestId: string, _msg: rpc.WorkerStatusRequest): void {
        workerStatusRequest(this, requestId, _msg);
    }

    /**
     * Host notifies worker of file content change
     */
    public fileChangeEventRequest(_requestId: string, _msg: rpc.FileChangeEventRequest): void {
        // Not yet implemented
    }

    /**
     * Host requests worker to cancel invocation
     */
    public invocationCancel(_requestId: string, _msg: rpc.InvocationCancel): void {
        // Not yet implemented
    }

    /**
     * Environment variables from the current process
     */
    public functionEnvironmentReloadRequest(requestId: string, msg: rpc.IFunctionEnvironmentReloadRequest): void {
        functionEnvironmentReloadRequest(this, requestId, msg);
    }

    public runInvocationRequestBefore(context: Context, userFunction: Function): Function {
        let wrappedFunction = userFunction;
        for (const before of this._invocationRequestBefore) {
            wrappedFunction = before(context, wrappedFunction);
        }
        return wrappedFunction;
    }

    public runInvocationRequestAfter(context: Context) {
        for (const after of this._invocationRequestAfter) {
            after(context);
        }
    }
}
