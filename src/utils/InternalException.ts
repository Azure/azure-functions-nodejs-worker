// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

export class InternalException extends Error {
    isAzureFunctionsInternalException = true;
}
