// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { InternalException } from './InternalException';

export class ReadOnlyException extends InternalException {
    constructor(propertyName: string) {
        super(`Attempting to set readonly property ${propertyName}`);
    }
}
