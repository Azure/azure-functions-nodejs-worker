// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { LogMetadata, ProgrammingModel } from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { AppContext } from './AppContext';
import { fromCoreLogLevel } from './coreApi/converters/fromCoreStatusResult';
import { AzFuncSystemError } from './errors';
import { IEventStream } from './GrpcClient';
import { InvocationLogContext, LogHookContext } from './hooks/LogHookContext';
import { sanitizeLogMetadata } from './utils/structuredLogProperties';

class WorkerContext {
    app = new AppContext(undefined);
    defaultProgrammingModel?: ProgrammingModel;

    /**
     * This will only be set after worker init request is received
     */
    _hostVersion?: string;

    #structuredLogWarnings = new WeakMap<object, Set<string>>();
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

    resetApp(functionAppDirectory: string | null | undefined): void {
        this.app = new AppContext(functionAppDirectory);
        this.app.programmingModel = this.defaultProgrammingModel;
    }

    /**
     * Captured logs or relevant details can use the logs property
     * @param requestId gRPC message request id
     * @param msg gRPC message content
     */
    log(
        log: rpc.IRpcLog,
        invocationLogCtx?: InvocationLogContext,
        metadata?: LogMetadata,
        warningScope: object = invocationLogCtx ?? this.app
    ): void {
        const sanitized = sanitizeLogMetadata(metadata);
        if (metadata !== undefined) {
            if (sanitized.rejectedCount > 0) {
                this.warnStructuredLog(
                    log,
                    invocationLogCtx,
                    warningScope,
                    'structured_log_invalid_properties',
                    sanitized.rejectedCount
                );
            }
            if (!this.app.logHooks.some((callback) => this.app.structuredLogHooks.has(callback))) {
                this.warnStructuredLog(log, invocationLogCtx, warningScope, 'structured_log_consumer_unavailable');
            }
        }
        try {
            const logContext = new LogHookContext(log, invocationLogCtx, sanitized.attributes);
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
    private warnStructuredLog(
        log: rpc.IRpcLog,
        invocationLogCtx: InvocationLogContext | undefined,
        scope: object,
        reason: string,
        rejectedCount?: number
    ): void {
        let warnings = this.#structuredLogWarnings.get(scope);
        if (!warnings) {
            warnings = new Set<string>();
            this.#structuredLogWarnings.set(scope, warnings);
        }
        if (warnings.has(reason)) {
            return;
        }
        warnings.add(reason);
        this.log(
            {
                invocationId: log.invocationId,
                category: log.category,
                logCategory: rpc.RpcLog.RpcLogCategory.System,
                level: rpc.RpcLog.Level.Warning,
                message: rejectedCount === undefined ? reason : `${reason}: rejected ${rejectedCount} properties`,
            },
            invocationLogCtx
        );
    }
}

export const worker = new WorkerContext();
