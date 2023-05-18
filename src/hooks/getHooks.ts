// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { HookCallback } from '@azure/functions-core';
import { worker } from '../WorkerContext';
import { AzFuncRangeError } from '../errors';

export function getHooks(hookName: string): HookCallback[] {
    switch (hookName) {
        case 'preInvocation':
            return worker.app.preInvocationHooks;
        case 'postInvocation':
            return worker.app.postInvocationHooks;
        case 'appStart':
            return worker.app.appStartHooks;
        case 'appTerminate':
            return worker.app.appTerminateHooks;
        default:
            throw new AzFuncRangeError(`Unrecognized hook "${hookName}"`);
    }
}
