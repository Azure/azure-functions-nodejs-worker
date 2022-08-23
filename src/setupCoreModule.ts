// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { FunctionCallback, FunctionMetadata, HookCallback, ProgrammingModel } from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { version } from './constants';
import { registerFunction } from './coreApi/registerFunction';
import { Disposable } from './Disposable';
import { WorkerChannel } from './WorkerChannel';
import Module = require('module');
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

/**
 * Intercepts the default "require" method so that we can provide our own "built-in" module
 * This module is essentially the publicly accessible API for our worker
 * This module is available to users only at runtime, not as an installable npm package
 */
export function setupCoreModule(channel: WorkerChannel): void {
    const coreApi = {
        version: version,
        get hostVersion() {
            return channel.hostVersion;
        },
        registerHook: (hookName: string, callback: HookCallback) => channel.registerHook(hookName, callback),
        setProgrammingModel: (programmingModel: ProgrammingModel) => {
            // Log when setting the programming model, except for the initial default one (partially because the grpc channels aren't fully setup at that time)
            if (channel.programmingModel) {
                channel.log({
                    message: `Setting Node.js programming model to "${programmingModel.name}" version "${programmingModel.version}"`,
                    level: LogLevel.Information,
                    logCategory: LogCategory.System,
                });
            }
            channel.programmingModel = programmingModel;
        },
        getProgrammingModel: () => {
            return channel.programmingModel;
        },
        registerFunction: (metadata: FunctionMetadata, callback: FunctionCallback) => {
            return registerFunction(channel, metadata, callback);
        },
        Disposable,
        // NOTE: We have to pass along any and all enums used in the RPC api to the core api
        RpcLog: rpc.RpcLog,
        RpcBindingInfo: rpc.BindingInfo,
        RpcHttpCookie: rpc.RpcHttpCookie,
    };

    Module.prototype.require = new Proxy(Module.prototype.require, {
        apply(target, thisArg, argArray) {
            if (argArray[0] === '@azure/functions-core') {
                return coreApi;
            } else {
                return Reflect.apply(target, thisArg, argArray);
            }
        },
    });

    // Set default programming model shipped with the worker
    // This has to be imported dynamically _after_ we setup the core module since it will almost certainly reference the core module
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const func: typeof import('@azure/functions') = require('@azure/functions');
    func.setup();
}
