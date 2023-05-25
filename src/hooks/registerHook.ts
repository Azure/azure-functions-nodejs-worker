// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { HookCallback } from '@azure/functions-core';
import { Disposable } from '../Disposable';
import { getHooks } from './getHooks';

export function registerHook(hookName: string, callback: HookCallback): Disposable {
    const hooks = getHooks(hookName);
    hooks.push(callback);
    return new Disposable(() => {
        const index = hooks.indexOf(callback);
        if (index > -1) {
            hooks.splice(index, 1);
        }
    });
}
