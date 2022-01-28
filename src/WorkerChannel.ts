// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { Context } from '@azure/functions';
import { access, constants } from 'fs';
import * as path from 'path';
import { format, isFunction } from 'util';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { CreateContextAndInputs, LogCallback, ResultCallback } from './Context';
import { toTypedData } from './converters';
import { IFunctionLoader } from './FunctionLoader';
import { IEventStream } from './GrpcService';
import { InternalException } from './utils/InternalException';
import { systemError } from './utils/Logger';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

type InvocationRequestBefore = (context: Context, userFn: Function) => Function;
type InvocationRequestAfter = (context: Context) => void;

/**
 * The worker channel should have a way to handle all incoming gRPC messages.
 * This includes all incoming StreamingMessage types (exclude *Response types and RpcLog type)
 */
interface IWorkerChannel {
    startStream(requestId: string, msg: rpc.StartStream): void;
    workerInitRequest(requestId: string, msg: rpc.WorkerInitRequest): void;
    workerHeartbeat(requestId: string, msg: rpc.WorkerHeartbeat): void;
    workerTerminate(requestId: string, msg: rpc.WorkerTerminate): void;
    workerStatusRequest(requestId: string, msg: rpc.WorkerStatusRequest): void;
    fileChangeEventRequest(requestId: string, msg: rpc.FileChangeEventRequest): void;
    functionLoadRequest(requestId: string, msg: rpc.FunctionLoadRequest): void;
    invocationRequest(requestId: string, msg: rpc.InvocationRequest): void;
    invocationCancel(requestId: string, msg: rpc.InvocationCancel): void;
    functionEnvironmentReloadRequest(requestId: string, msg: rpc.IFunctionEnvironmentReloadRequest): void;
    registerBeforeInvocationRequest(beforeCb: InvocationRequestBefore): void;
    registerAfterInvocationRequest(afterCb: InvocationRequestAfter): void;
}

/**
 * Initializes handlers for incoming gRPC messages on the client
 */
export class WorkerChannel implements IWorkerChannel {
    private _eventStream: IEventStream;
    private _functionLoader: IFunctionLoader;
    private _workerId: string;
    private _invocationRequestBefore: InvocationRequestBefore[];
    private _invocationRequestAfter: InvocationRequestAfter[];

    constructor(workerId: string, eventStream: IEventStream, functionLoader: IFunctionLoader) {
        this._workerId = workerId;
        this._eventStream = eventStream;
        this._functionLoader = functionLoader;
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
    private log(log: rpc.IRpcLog) {
        this._eventStream.write({
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
    public workerInitRequest(requestId: string, msg: rpc.WorkerInitRequest) {
        // Validate version
        const version = process.version;
        if (
            (version.startsWith('v17.') || version.startsWith('v15.')) &&
            process.env.AZURE_FUNCTIONS_ENVIRONMENT == 'Development'
        ) {
            const msg =
                'Node.js version used (' +
                version +
                ') is not officially supported. You may use it during local development, but must use an officially supported version on Azure:' +
                ' https://aka.ms/functions-node-versions';
            this.log({
                message: msg,
                level: LogLevel.Warning,
                logCategory: LogCategory.System,
            });
        } else if (!(version.startsWith('v14.') || version.startsWith('v16.'))) {
            const msg =
                'Incompatible Node.js version' +
                ' (' +
                version +
                ').' +
                ' The version of the Azure Functions runtime you are using (v4) supports Node.js v14.x or Node.js v16.x' +
                ' Refer to our documentation to see the Node.js versions supported by each version of Azure Functions: https://aka.ms/functions-node-versions';
            systemError(msg);
            throw new InternalException(msg);
        }

        this.logColdStartWarning();

        const workerCapabilities = {
            RpcHttpTriggerMetadataRemoved: 'true',
            RpcHttpBodyOnly: 'true',
            IgnoreEmptyValuedRpcHttpHeaders: 'true',
            UseNullableValueDictionaryForHttp: 'true',
            WorkerStatus: 'true',
            TypedDataCollection: 'true',
        };

        this._eventStream.write({
            requestId: requestId,
            workerInitResponse: {
                result: this.getStatus(),
                capabilities: workerCapabilities,
            },
        });
    }

    /**
     * Worker responds after loading required metadata to load function with the load result
     * @param requestId gRPC message request id
     * @param msg gRPC message content
     */
    public async functionLoadRequest(requestId: string, msg: rpc.FunctionLoadRequest) {
        if (msg.functionId && msg.metadata) {
            let err, errorMessage;
            try {
                await this._functionLoader.load(msg.functionId, msg.metadata);
            } catch (exception) {
                errorMessage = `Worker was unable to load function ${msg.metadata.name}: '${exception}'`;
                this.log({
                    message: errorMessage,
                    level: LogLevel.Error,
                    logCategory: LogCategory.System,
                });
                err = exception;
            }

            this._eventStream.write({
                requestId: requestId,
                functionLoadResponse: {
                    functionId: msg.functionId,
                    result: this.getStatus(err, errorMessage),
                },
            });
        }
    }

    /**
     * Host requests worker to invoke a Function
     * @param requestId gRPC message request id
     * @param msg gRPC message content
     */
    public invocationRequest(requestId: string, msg: rpc.InvocationRequest) {
        const info = this._functionLoader.getInfo(<string>msg.functionId);
        const logCallback: LogCallback = (level, category, ...args) => {
            this.log({
                invocationId: msg.invocationId,
                category: `${info.name}.Invocation`,
                message: format.apply(null, <[any, any[]]>args),
                level: level,
                logCategory: category,
            });
        };

        // Log invocation details to ensure the invocation received by node worker
        logCallback(LogLevel.Debug, LogCategory.System, 'Received FunctionInvocationRequest');

        const resultCallback: ResultCallback = (err, result) => {
            const response: rpc.IInvocationResponse = {
                invocationId: msg.invocationId,
                result: this.getStatus(err),
            };
            // explicitly set outputData to empty array to concat later
            response.outputData = [];

            // As legacy behavior, falsy values get serialized to `null` in AzFunctions.
            // This breaks Durable Functions expectations, where customers expect any
            // JSON-serializable values to be preserved by the framework,
            // so we check if we're serializing for durable and, if so, ensure falsy
            // values get serialized.
            const isDurableBinding = info?.bindings?.name?.type == 'activityTrigger';

            try {
                if (result || (isDurableBinding && result != null)) {
                    const returnBinding = info.getReturnBinding();
                    // Set results from return / context.done
                    if (result.return || (isDurableBinding && result.return != null)) {
                        // $return binding is found: return result data to $return binding
                        if (returnBinding) {
                            response.returnValue = returnBinding.converter(result.return);
                            // $return binding is not found: read result as object of outputs
                        } else {
                            response.outputData = Object.keys(info.outputBindings)
                                .filter((key) => result.return[key] !== undefined)
                                .map(
                                    (key) =>
                                        <rpc.IParameterBinding>{
                                            name: key,
                                            data: info.outputBindings[key].converter(result.return[key]),
                                        }
                                );
                        }
                        // returned value does not match any output bindings (named or $return)
                        // if not http, pass along value
                        if (!response.returnValue && response.outputData.length == 0 && !info.hasHttpTrigger) {
                            response.returnValue = toTypedData(result.return);
                        }
                    }
                    // Set results from context.bindings
                    if (result.bindings) {
                        response.outputData = response.outputData.concat(
                            Object.keys(info.outputBindings)
                                // Data from return prioritized over data from context.bindings
                                .filter((key) => {
                                    const definedInBindings: boolean = result.bindings[key] !== undefined;
                                    const hasReturnValue = !!result.return;
                                    const hasReturnBinding = !!returnBinding;
                                    const definedInReturn: boolean =
                                        hasReturnValue && !hasReturnBinding && result.return[key] !== undefined;
                                    return definedInBindings && !definedInReturn;
                                })
                                .map(
                                    (key) =>
                                        <rpc.IParameterBinding>{
                                            name: key,
                                            data: info.outputBindings[key].converter(result.bindings[key]),
                                        }
                                )
                        );
                    }
                }
            } catch (e) {
                response.result = this.getStatus(e);
            }
            this._eventStream.write({
                requestId: requestId,
                invocationResponse: response,
            });

            this.runInvocationRequestAfter(context);
        };

        const { context, inputs } = CreateContextAndInputs(info, msg, logCallback, resultCallback);
        let userFunction = this._functionLoader.getFunc(<string>msg.functionId);

        userFunction = this.runInvocationRequestBefore(context, userFunction);

        // catch user errors from the same async context in the event loop and correlate with invocation
        // throws from asynchronous work (setTimeout, etc) are caught by 'unhandledException' and cannot be correlated with invocation
        try {
            const result = userFunction(context, ...inputs);

            if (result && isFunction(result.then)) {
                result
                    .then((result) => {
                        (<any>context.done)(null, result, true);
                    })
                    .catch((err) => {
                        (<any>context.done)(err, null, true);
                    });
            }
        } catch (err) {
            resultCallback(err);
        }
    }

    /**
     * Worker sends the host information identifying itself
     */
    public startStream(requestId: string, msg: rpc.StartStream): void {
        // Not yet implemented
    }

    /**
     * Message is empty by design - Will add more fields in future if needed
     */
    public workerHeartbeat(requestId: string, msg: rpc.WorkerHeartbeat): void {
        // Not yet implemented
    }

    /**
     * Warning before killing the process after grace_period
     * Worker self terminates ..no response on this
     */
    public workerTerminate(requestId: string, msg: rpc.WorkerTerminate): void {
        // Not yet implemented
    }

    /**
     * Worker sends the host empty response to evaluate the worker's latency
     */
    public workerStatusRequest(requestId: string, msg: rpc.WorkerStatusRequest): void {
        const workerStatusResponse: rpc.IWorkerStatusResponse = {};
        this._eventStream.write({
            requestId: requestId,
            workerStatusResponse,
        });
    }

    /**
     * Host notifies worker of file content change
     */
    public fileChangeEventRequest(requestId: string, msg: rpc.FileChangeEventRequest): void {
        // Not yet implemented
    }

    /**
     * Host requests worker to cancel invocation
     */
    public invocationCancel(requestId: string, msg: rpc.InvocationCancel): void {
        // Not yet implemented
    }

    /**
     * Environment variables from the current process
     */
    public functionEnvironmentReloadRequest(requestId: string, msg: rpc.IFunctionEnvironmentReloadRequest): void {
        // Add environment variables from incoming
        const numVariables = (msg.environmentVariables && Object.keys(msg.environmentVariables).length) || 0;
        this.log({
            message: `Reloading environment variables. Found ${numVariables} variables to reload.`,
            level: LogLevel.Information,
            logCategory: LogCategory.System,
        });

        let error = null;
        try {
            process.env = Object.assign({}, msg.environmentVariables);
            // Change current working directory
            if (msg.functionAppDirectory) {
                this.log({
                    message: `Changing current working directory to ${msg.functionAppDirectory}`,
                    level: LogLevel.Information,
                    logCategory: LogCategory.System,
                });
                process.chdir(msg.functionAppDirectory);
            }
        } catch (e) {
            error = e;
        }

        const functionEnvironmentReloadResponse: rpc.IFunctionEnvironmentReloadResponse = {
            result: this.getStatus(error),
        };

        this._eventStream.write({
            requestId: requestId,
            functionEnvironmentReloadResponse,
        });
    }

    private getStatus(err?: any, errorMessage?: string): rpc.IStatusResult {
        const status: rpc.IStatusResult = {
            status: rpc.StatusResult.Status.Success,
        };

        if (err) {
            status.status = rpc.StatusResult.Status.Failure;
            status.exception = {
                message: errorMessage || err.toString(),
                stackTrace: err.stack,
            };
        }

        return status;
    }

    private runInvocationRequestBefore(context: Context, userFunction: Function): Function {
        let wrappedFunction = userFunction;
        for (const before of this._invocationRequestBefore) {
            wrappedFunction = before(context, wrappedFunction);
        }
        return wrappedFunction;
    }

    private runInvocationRequestAfter(context: Context) {
        for (const after of this._invocationRequestAfter) {
            after(context);
        }
    }

    private logColdStartWarning(delayInMs?: number): void {
        // On reading a js file with function code('require') NodeJs tries to find 'package.json' all the way up to the file system root.
        // In Azure files it causes a delay during cold start as connection to Azure Files is an expensive operation.
        if (
            process.env.WEBSITE_CONTENTAZUREFILECONNECTIONSTRING &&
            process.env.WEBSITE_CONTENTSHARE &&
            process.env.AzureWebJobsScriptRoot
        ) {
            // Add delay to avoid affecting coldstart
            if (!delayInMs) {
                delayInMs = 5000;
            }
            setTimeout(() => {
                access(path.join(process.env.AzureWebJobsScriptRoot!, 'package.json'), constants.F_OK, (e) => {
                    if (e) {
                        this.log({
                            message:
                                'package.json is not found at the root of the Function App in Azure Files - cold start for NodeJs can be affected.',
                            level: LogLevel.Debug,
                            logCategory: LogCategory.System,
                        });
                    }
                });
            }, delayInMs);
        }
    }
}
