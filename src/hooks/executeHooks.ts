// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { HookContext } from '@azure/functions-core';
import { getHooks } from './getHooks';

export async function executeHooks(hookName: string, context: HookContext): Promise<void> {
    const callbacks = getHooks(hookName);
    if (callbacks.length > 0) {
        for (const callback of callbacks) {
            await callback(context);
        }
    }
}
