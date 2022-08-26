// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzFuncRangeError } from '../../errors';

export function handleDefaultEnumCase(data: undefined | null | string, typeName: string): undefined | null {
    switch (data) {
        case undefined:
            return undefined;
        case null:
            return null;
        default:
            throw new AzFuncRangeError(`Unexpected value "${data}" for type "${typeName}"`);
    }
}
