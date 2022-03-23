// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { HookCallback } from '@azure/functions-core';
import { Disposable } from './Disposable';
import { WorkerChannel } from './WorkerChannel';
import Module = require('module');

/**
 * Intercepts the default "require" method so that we can provide our own "built-in" module
 * This module is essentially the publicly accessible API for our worker
 * This module is available to users only at runtime, not as an installable npm package
 */
export function setupCoreModule(channel: WorkerChannel): void {
    const workerApi = {
        registerHook: (hookName: string, callback: HookCallback) => channel.registerHook(hookName, callback),
        Disposable,
    };

    Module.prototype.require = new Proxy(Module.prototype.require, {
        apply(target, thisArg, argArray) {
            if (argArray[0] === '@azure/functions-core') {
                return workerApi;
            } else {
                return Reflect.apply(target, thisArg, argArray);
            }
        },
    });
}
