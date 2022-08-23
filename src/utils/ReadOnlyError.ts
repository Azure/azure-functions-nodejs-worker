// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

export class ReadOnlyError extends TypeError {
    isAzureFunctionsInternalException = true;
    constructor(propertyName: string) {
        super(`Cannot assign to read only property '${propertyName}'`);
    }
}
