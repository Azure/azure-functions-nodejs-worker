// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AppStartupContext, HookCallback, HookContext, HookData } from '@azure/functions-core';
import { pathExists } from 'fs-extra';
import { format } from 'util';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { Disposable } from './Disposable';
import { IFunctionLoader } from './FunctionLoader';
import { IEventStream } from './GrpcClient';
import { loadScriptFile } from './loadScriptFile';
import { PackageJson, parsePackageJson } from './parsers/parsePackageJson';
import { ensureErrorType } from './utils/ensureErrorType';
import path = require('path');
import LogLevel = rpc.RpcLog.Level;
import LogCategory = rpc.RpcLog.RpcLogCategory;

export class WorkerChannel {
    eventStream: IEventStream;
    functionLoader: IFunctionLoader;
    packageJson: PackageJson;
    #functionAppDirectory = '';
    #hookData: HookData = {};
    #preInvocationHooks: HookCallback[] = [];
    #postInvocationHooks: HookCallback[] = [];
    #appStartupHooks: HookCallback[] = [];
    #appTeardownHooks: HookCallback[] = [];

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
            context.hookData = this.#hookData;
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

    getBaseHookContext(): HookContext {
        const logger = Object.assign((...args: any[]) => this.#userLog(LogLevel.Information, ...args), {
            info: (...args: any[]) => this.#userLog(LogLevel.Information, ...args),
            warn: (...args: any[]) => this.#userLog(LogLevel.Warning, ...args),
            error: (...args: any[]) => this.#userLog(LogLevel.Error, ...args),
            verbose: (...args: any[]) => this.#userLog(LogLevel.Trace, ...args),
        });
        return {
            hookData: this.#hookData,
            logger,
        };
    }

    #userLog(level: LogLevel, ...args: any[]): void {
        this.log({
            message: format.apply(null, <[any, any[]]>args),
            logCategory: LogCategory.User,
            level,
        });
    }

    #getHooks(hookName: string): HookCallback[] {
        switch (hookName) {
            case 'preInvocation':
                return this.#preInvocationHooks;
            case 'postInvocation':
                return this.#postInvocationHooks;
            case 'appStartup':
                return this.#appStartupHooks;
            case 'appTeardown':
                return this.#appTeardownHooks;
            default:
                throw new RangeError(`Unrecognized hook "${hookName}"`);
        }
    }

    async updateFunctionAppDirectory(functionAppDirectory: string): Promise<void> {
        if (functionAppDirectory !== this.#functionAppDirectory) {
            this.#functionAppDirectory = functionAppDirectory;
            this.#clearHooks();
            await this.#updatePackageJson(functionAppDirectory);
            await this.#loadEntryPointFile(functionAppDirectory);
            const baseContext: HookContext = this.getBaseHookContext();
            const appStartupContext: AppStartupContext = {
                logger: baseContext.logger,
                hookData: baseContext.hookData,
                functionAppDirectory: functionAppDirectory,
            };
            await this.executeHooks('appStartup', appStartupContext);
        }
    }

    async #updatePackageJson(dir: string): Promise<void> {
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

    async #loadEntryPointFile(functionAppDirectory: string): Promise<void> {
        const entryPointFile = this.packageJson.main;
        if (entryPointFile) {
            this.log({
                message: `Loading entry point "${entryPointFile}"`,
                level: LogLevel.Debug,
                logCategory: LogCategory.System,
            });
            try {
                const entryPointFullPath = path.join(functionAppDirectory, entryPointFile);
                if (!(await pathExists(entryPointFullPath))) {
                    throw new Error(`file does not exist`);
                }

                await loadScriptFile(entryPointFullPath, this.packageJson);
                this.log({
                    message: `Loaded entry point "${entryPointFile}"`,
                    level: LogLevel.Debug,
                    logCategory: LogCategory.System,
                });
            } catch (err) {
                const error = ensureErrorType(err);
                error.isAzureFunctionsInternalException = true;
                error.message = `Worker was unable to load entry point "${entryPointFile}": ${error.message}`;
                throw error;
            }
        }
    }

    #clearHooks() {
        this.#preInvocationHooks = this.#postInvocationHooks = this.#appStartupHooks = this.#appTeardownHooks = [];
        this.#hookData = {};
    }
}
