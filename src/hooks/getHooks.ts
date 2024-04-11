// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { HookCallback } from '@azure/functions-core';
import { AzFuncRangeError } from '../errors';
import { worker } from '../WorkerContext';

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
        case 'log':
            return worker.app.logHooks;
        default:
            throw new AzFuncRangeError(`Unrecognized hook "${hookName}"`);
    }
}
