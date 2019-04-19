import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';

/**
 * The worker channel should have a way to handle all incoming gRPC messages.
 * This includes all incoming StreamingMessage types after channel is established (exclude *Response types and RpcLog, and StartStream)
 */
export interface IWorkerChannel {
    workerInitRequest(requestId: string, msg: rpc.WorkerInitRequest): void;
    workerHeartbeat(requestId: string, msg: rpc.WorkerHeartbeat): void;
    workerTerminate(requestId: string, msg: rpc.WorkerTerminate): void;
    workerStatusRequest(requestId: string, msg: rpc.WorkerStatusRequest): void;
    fileChangeEventRequest(requestId: string, msg: rpc.FileChangeEventRequest): void;
    functionLoadRequest(requestId: string, msg: rpc.FunctionLoadRequest): void;
    invocationRequest(requestId: string, msg: rpc.InvocationRequest): void;
    invocationCancel(requestId: string, msg: rpc.InvocationCancel): void;
    functionEnvironmentReloadRequest(requestId: string, msg: rpc.IFunctionEnvironmentReloadRequest): void;
}