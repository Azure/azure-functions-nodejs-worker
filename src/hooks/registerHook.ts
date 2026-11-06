// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { HookCallback, LogHookOptions } from '@azure/functions-core';
import { Disposable } from '../Disposable';
import { worker } from '../WorkerContext';
import { getHooks } from './getHooks';

export function registerHook(hookName: string, callback: HookCallback, options?: LogHookOptions): Disposable {
    const hooks = getHooks(hookName);
    const app = worker.app;
    const registeredCallback: HookCallback = (context) => callback(context);
    hooks.push(registeredCallback);
    if (hookName === 'log' && options?.structuredLogProperties === true) {
        app.structuredLogHooks.add(registeredCallback);
    }
    return new Disposable(() => {
        app.structuredLogHooks.delete(registeredCallback);
        const index = hooks.indexOf(registeredCallback);
        if (index > -1) {
            hooks.splice(index, 1);
        }
    });
}
