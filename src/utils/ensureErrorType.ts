// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

export interface AzFuncError extends Error {
    isAzureFunctionsInternalException?: boolean;
}

export function ensureErrorType(err: unknown): AzFuncError {
    if (err instanceof Error) {
        return err;
    } else {
        let message: string;
        if (err === undefined || err === null) {
            message = 'Unknown error';
        } else if (typeof err === 'string') {
            message = err;
        } else if (typeof err === 'object') {
            message = JSON.stringify(err);
        } else {
            message = String(err);
        }
        return new Error(message);
    }
}

/**
 * This is mostly for callbacks where `null` or `undefined` indicates there is no error
 * By contrast, anything thrown/caught is assumed to be an error regardless of what it is
 */
export function isError(err: unknown): boolean {
    return err !== null && err !== undefined;
}
