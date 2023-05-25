// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { HookCallback } from '@azure/functions-core';
import { channel } from '../WorkerChannel';
import { AzFuncRangeError } from '../errors';

export function getHooks(hookName: string): HookCallback[] {
    switch (hookName) {
        case 'preInvocation':
            return channel.app.preInvocationHooks;
        case 'postInvocation':
            return channel.app.postInvocationHooks;
        case 'appStart':
            return channel.app.appStartHooks;
        case 'appTerminate':
            return channel.app.appTerminateHooks;
        default:
            throw new AzFuncRangeError(`Unrecognized hook "${hookName}"`);
    }
}
