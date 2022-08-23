// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

export function handleDefaultEnumCase(data: undefined | null | string, typeName: string): undefined | null {
    switch (data) {
        case undefined:
            return undefined;
        case null:
            return null;
        default:
            throw new RangeError(`Unexpected value "${data}" for type "${typeName}"`);
    }
}
