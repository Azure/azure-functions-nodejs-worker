// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

export function isEnvironmentVariableSet(val: string | boolean | number | undefined | null): boolean {
    return !/^(false|0)?$/i.test(val === undefined || val === null ? '' : String(val));
}
