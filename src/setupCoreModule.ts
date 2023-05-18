// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { Disposable } from './Disposable';
import { channel } from './WorkerChannel';
import { version } from './constants';
import { registerFunction } from './coreApi/registerFunction';
import { setProgrammingModel } from './coreApi/setProgrammingModel';
import { registerHook } from './hooks/registerHook';
import Module = require('module');

/**
 * Intercepts the default "require" method so that we can provide our own "built-in" module
 * This module is essentially the publicly accessible API for our worker
 * This module is available to users only at runtime, not as an installable npm package
 */
export function setupCoreModule(): void {
    const coreApi = {
        version: version,
        get hostVersion() {
            return channel.hostVersion;
        },
        registerHook,
        setProgrammingModel,
        getProgrammingModel: () => {
            return channel.app.programmingModel;
        },
        registerFunction,
        Disposable,
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
