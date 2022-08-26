// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

/**
 * Removes some unnecessary properties that may have been set to `undefined` during conversion
 */
export function ensureKeysMatch<TData, TResult>(data: TData, result: TResult): TResult {
    for (const key of Object.keys(result)) {
        if (!(key in data)) {
            delete result[key];
        }
    }
    return result;
}
