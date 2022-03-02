// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { HookCallback } from '@azure/functions-worker';
import { Disposable } from './Disposable';
import { WorkerChannel } from './WorkerChannel';
import Module = require('module');

export function setupWorkerModule(channel: WorkerChannel): void {
    const workerApi = {
        registerHook: (hookName: string, callback: HookCallback) => channel.registerHook(hookName, callback),
        Disposable,
    };

    Module.prototype.require = new Proxy(Module.prototype.require, {
        apply(target, thisArg, argArray) {
            if (argArray[0] === '@azure/functions-worker') {
                return workerApi;
            } else {
                return Reflect.apply(target, thisArg, argArray);
            }
        },
    });
}
