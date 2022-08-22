// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { HookCallback, HookContext, HookData, ProgrammingModel } from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { Disposable } from './Disposable';
import { IFunctionLoader } from './FunctionLoader';
import { IEventStream } from './GrpcClient';
import { PackageJson, parsePackageJson } from './parsers/parsePackageJson';
import { ensureErrorType } from './utils/ensureErrorType';
import LogLevel = rpc.RpcLog.Level;
import LogCategory = rpc.RpcLog.RpcLogCategory;

export class WorkerChannel {
    eventStream: IEventStream;
    functionLoader: IFunctionLoader;
    packageJson: PackageJson;
    /**
     * This will only be set after worker init request is received
     */
    _hostVersion?: string;

    /**
     * this hook data will be passed to (and set by) all hooks in all scopes
     */
    appHookData: HookData = {};
    /**
     * this hook data is limited to the app-level scope and persisted only for app-level hooks
     */
    appLevelOnlyHookData: HookData = {};
    programmingModel?: ProgrammingModel;
    #preInvocationHooks: HookCallback[] = [];
    #postInvocationHooks: HookCallback[] = [];
    #appStartHooks: HookCallback[] = [];

    constructor(eventStream: IEventStream, functionLoader: IFunctionLoader) {
        this.eventStream = eventStream;
        this.functionLoader = functionLoader;
        this.packageJson = {};
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

    get hostVersion(): string {
        if (!this._hostVersion) {
            throw new Error('Trying to access hostVersion before it is set.');
        } else {
            return this._hostVersion;
        }
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
                return this.#preInvocationHooks;
            case 'postInvocation':
                return this.#postInvocationHooks;
            case 'appStart':
                return this.#appStartHooks;
            default:
                throw new RangeError(`Unrecognized hook "${hookName}"`);
        }
    }

    async updatePackageJson(dir: string): Promise<void> {
        try {
            this.packageJson = await parsePackageJson(dir);
        } catch (err) {
            const error = ensureErrorType(err);
            this.log({
                message: `Worker failed to load package.json: ${error.message}`,
                level: LogLevel.Warning,
                logCategory: LogCategory.System,
            });
            this.packageJson = {};
        }
    }
}
