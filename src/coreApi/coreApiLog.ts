// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as coreTypes from '@azure/functions-core';
import { worker } from '../WorkerContext';
import { fromCoreLogCategory, fromCoreLogLevel } from './converters/fromCoreStatusResult';

export function coreApiLog(level: coreTypes.RpcLogLevel, category: coreTypes.RpcLogCategory, message: string): void {
    worker.log({
        message,
        level: fromCoreLogLevel(level),
        logCategory: fromCoreLogCategory(category),
    });
}
