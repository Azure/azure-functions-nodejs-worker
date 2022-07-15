// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import Module = require('module');

export function setupTestCoreApi(): void {
    const coreApi = {
        RpcLog: { Level, RpcLogCategory },
        RpcHttpCookie: { SameSite },
        RpcBindingInfo: { Direction, DataType },
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
}

enum Level {
    Trace = 0,
    Debug = 1,
    Information = 2,
    Warning = 3,
    Error = 4,
    Critical = 5,
    None = 6,
}

enum RpcLogCategory {
    User = 0,
    System = 1,
    CustomMetric = 2,
}

enum SameSite {
    None = 0,
    Lax = 1,
    Strict = 2,
    ExplicitNone = 3,
}

enum Direction {
    in = 0,
    out = 1,
    inout = 2,
}

enum DataType {
    undefined = 0,
    string = 1,
    binary = 2,
    stream = 3,
}
