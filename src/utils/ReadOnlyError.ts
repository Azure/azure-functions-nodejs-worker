// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { InternalException } from './InternalException';

export class ReadOnlyError extends InternalException implements TypeError {
    constructor(propertyName: string) {
        super(`Attempting to set readonly property ${propertyName}`);
    }
}
