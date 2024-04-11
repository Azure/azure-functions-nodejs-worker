// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { ProgrammingModel } from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { AppContext } from './AppContext';
import { fromCoreLogLevel } from './coreApi/converters/fromCoreStatusResult';
import { AzFuncSystemError } from './errors';
import { IEventStream } from './GrpcClient';
import { InvocationLogContext, LogHookContext } from './hooks/LogHookContext';

class WorkerContext {
    app = new AppContext();
    defaultProgrammingModel?: ProgrammingModel;

    /**
     * This will only be set after worker init request is received
     */
    _hostVersion?: string;

    #id?: string;
    #eventStream?: IEventStream;
    #notInitializedMsg = 'WorkerContext has not been initialized yet.';

    get id(): string {
        if (!this.#id) {
            throw new AzFuncSystemError(this.#notInitializedMsg);
        } else {
            return this.#id;
        }
    }

    set id(value: string) {
        this.#id = value;
    }

    get eventStream(): IEventStream {
        if (!this.#eventStream) {
            throw new AzFuncSystemError(this.#notInitializedMsg);
        } else {
            return this.#eventStream;
        }
    }

    set eventStream(value: IEventStream) {
        this.#eventStream = value;
    }

    get hostVersion(): string {
        if (!this._hostVersion) {
            throw new AzFuncSystemError('Cannot access hostVersion before worker init');
        } else {
            return this._hostVersion;
        }
    }

    resetApp(): void {
        this.app = new AppContext();
        this.app.programmingModel = this.defaultProgrammingModel;
    }

    /**
     * Captured logs or relevant details can use the logs property
     * @param requestId gRPC message request id
     * @param msg gRPC message content
     */
    log(log: rpc.IRpcLog, invocationLogCtx?: InvocationLogContext): void {
        try {
            const logContext = new LogHookContext(log, invocationLogCtx);
            for (const callback of worker.app.logHooks) {
                callback(logContext);
            }

            if (log.logCategory === rpc.RpcLog.RpcLogCategory.User) {
                // let hooks change and filter these values, but only for user-generated logs
                // system logs should always be sent as-is
                log.message = logContext.message;
                log.level = fromCoreLogLevel(logContext.level);
            }
        } catch {
            // ignore so that user hooks can't prevent system logs
        }

        this.eventStream.write({
            rpcLog: log,
        });
    }
}

export const worker = new WorkerContext();
