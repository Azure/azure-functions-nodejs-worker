// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { HookCallback, HookContext } from '@azure/functions-core';
import { readJson } from 'fs-extra';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { Disposable } from './Disposable';
import { IFunctionLoader } from './FunctionLoader';
import { IEventStream } from './GrpcClient';
import { ensureErrorType } from './utils/ensureErrorType';
import path = require('path');
import LogLevel = rpc.RpcLog.Level;
import LogCategory = rpc.RpcLog.RpcLogCategory;

export interface PackageJson {
    type?: string;
}

export class WorkerChannel {
    eventStream: IEventStream;
    functionLoader: IFunctionLoader;
    packageJson: PackageJson;
    #preInvocationHooks: HookCallback[] = [];
    #postInvocationHooks: HookCallback[] = [];

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

    async executeHooks(hookName: string, context: HookContext): Promise<void> {
        const callbacks = this.#getHooks(hookName);
        for (const callback of callbacks) {
            await callback(context);
        }
    }

    #getHooks(hookName: string): HookCallback[] {
        switch (hookName) {
            case 'preInvocation':
                return this.#preInvocationHooks;
            case 'postInvocation':
                return this.#postInvocationHooks;
            default:
                throw new RangeError(`Unrecognized hook "${hookName}"`);
        }
    }

    async updatePackageJson(dir: string): Promise<void> {
        try {
            this.packageJson = await readJson(path.join(dir, 'package.json'));
        } catch (err) {
            const error: Error = ensureErrorType(err);
            let errorMsg: string;
            if (error.name === 'SyntaxError') {
                errorMsg = `file is not a valid JSON: ${error.message}`;
            } else if (error.message.startsWith('ENOENT')) {
                errorMsg = `file does not exist.`;
            } else {
                errorMsg = error.message;
            }
            errorMsg = `Worker failed to load package.json: ${errorMsg}`;
            this.log({
                message: errorMsg,
                level: LogLevel.Warning,
                logCategory: LogCategory.System,
            });
            this.packageJson = {};
        }
    }
}
