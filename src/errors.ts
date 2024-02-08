// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

export interface AzFuncError {
    /**
     * System errors can be tracked in our telemetry
     * User errors cannot be tracked in our telemetry because they could have user information (users can still track it themselves in their app insights resource)
     */
    isAzureFunctionsSystemError: boolean;
}

export class AzFuncSystemError extends Error {
    isAzureFunctionsSystemError = true;
}

export class AzFuncTypeError extends TypeError implements AzFuncError {
    isAzureFunctionsSystemError = true;
}

export class AzFuncRangeError extends RangeError implements AzFuncError {
    isAzureFunctionsSystemError = true;
}

export class ReadOnlyError extends AzFuncTypeError {
    constructor(propertyName: string) {
        super(`Cannot assign to read only property '${propertyName}'`);
    }
}

export function ensureErrorType(err: unknown): Error & Partial<AzFuncError> {
    if (err instanceof Error) {
        const writable = Object.getOwnPropertyDescriptor(err, 'message')?.writable;
        if (writable) {
            return err;
        } else {
            // If we cannot modify the message, we want to wrap the original error
            // The motivation for this branch can be found in the below issue:
            // https://github.com/Azure/azure-functions-nodejs-library/issues/205
            const oldStack = err.stack;
            const oldName = err.name;
            const newError = new Error(err.message);
            newError.stack = oldStack;
            newError.name = oldName;
            return newError;
        }
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
