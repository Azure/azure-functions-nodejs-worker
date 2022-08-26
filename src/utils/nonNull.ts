// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzFuncSystemError } from '../errors';

/**
 * Retrieves a property by name from an object and checks that it's not null and not undefined.  It is strongly typed
 * for the property and will give a compile error if the given name is not a property of the source.
 */
export function nonNullProp<TSource, TKey extends keyof TSource>(
    source: TSource,
    name: TKey
): NonNullable<TSource[TKey]> {
    const value: NonNullable<TSource[TKey]> = <NonNullable<TSource[TKey]>>source[name];
    return nonNullValue(value, <string>name);
}

/**
 * Validates that a given value is not null and not undefined.
 */
export function nonNullValue<T>(value: T | undefined, propertyNameOrMessage?: string): T {
    if (value === null || value === undefined) {
        throw new AzFuncSystemError(
            'Internal error: Expected value to be neither null nor undefined' +
                (propertyNameOrMessage ? `: ${propertyNameOrMessage}` : '')
        );
    }

    return value;
}
