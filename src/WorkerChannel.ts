// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { HookCallback, HookContext, ProgrammingModel } from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { AppContext } from './AppContext';
import { Disposable } from './Disposable';
import { IEventStream } from './GrpcClient';
import { AzFuncRangeError, AzFuncSystemError, ensureErrorType } from './errors';
import { parsePackageJson } from './parsers/parsePackageJson';
import LogLevel = rpc.RpcLog.Level;
import LogCategory = rpc.RpcLog.RpcLogCategory;

export class WorkerChannel {
    workerId: string;
    eventStream: IEventStream;
    app = new AppContext();
    defaultProgrammingModel?: ProgrammingModel;

    /**
     * This will only be set after worker init request is received
     */
    _hostVersion?: string;

    get hostVersion(): string {
        if (!this._hostVersion) {
            throw new AzFuncSystemError('Cannot access hostVersion before worker init');
        } else {
            return this._hostVersion;
        }
    }

    constructor(workerId: string, eventStream: IEventStream) {
        this.workerId = workerId;
        this.eventStream = eventStream;
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
    log(log: rpc.IRpcLog) {
        this.eventStream.write({
            rpcLog: log,
        });
    }

    registerHook(hookName: string, callback: HookCallback): Disposable {
        const hooks = this.#getHooks(hookName);
        hooks.push(callback);
        return new Disposable(() => {
            const index = hooks.indexOf(callback);
            if (index > -1) {
                hooks.splice(index, 1);
            }
        });
    }

    async executeHooks(
        hookName: string,
        context: HookContext,
        invocationId?: string | null,
        msgCategory?: string
    ): Promise<void> {
        const callbacks = this.#getHooks(hookName);
        if (callbacks.length > 0) {
            this.log({
                message: `Executing ${callbacks.length} "${hookName}" hooks`,
                level: LogLevel.Debug,
                logCategory: LogCategory.System,
                invocationId,
                category: msgCategory,
            });
            for (const callback of callbacks) {
                await callback(context);
            }
            this.log({
                message: `Executed "${hookName}" hooks`,
                level: LogLevel.Debug,
                logCategory: LogCategory.System,
                invocationId,
                category: msgCategory,
            });
        }
    }

    #getHooks(hookName: string): HookCallback[] {
        switch (hookName) {
            case 'preInvocation':
                return this.app.preInvocationHooks;
            case 'postInvocation':
                return this.app.postInvocationHooks;
            case 'appStart':
                return this.app.appStartHooks;
            case 'appTerminate':
                return this.app.appTerminateHooks;
            default:
                throw new AzFuncRangeError(`Unrecognized hook "${hookName}"`);
        }
    }

    async updatePackageJson(dir: string): Promise<void> {
        try {
            this.app.packageJson = await parsePackageJson(dir);
        } catch (err) {
            const error = ensureErrorType(err);
            this.log({
                message: `Worker failed to load package.json: ${error.message}`,
                level: LogLevel.Warning,
                logCategory: LogCategory.System,
            });
            this.app.packageJson = {};
        }
    }
}
