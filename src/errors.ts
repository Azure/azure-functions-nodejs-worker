// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

export interface AzFuncError {
    /**
     * System errors can be tracked in our telemetry
     * User errors cannot be tracked in our telemetry because they could have user information (users can still track it themselves in their app insights resource)
     */
    isAzureFunctionsSystemError: boolean;

    loggedOverRpc?: boolean;
}

export interface ValidatedError extends Error, Partial<AzFuncError> {
    /**
     * Use `trySetErrorMessage` to set the error message
     */
    readonly message: string;
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

const hiddenCredential = '[Hidden Credential]';
const circularReference = '[Circular]';
const credentialNameFragments = ['password', 'pwd', 'key', 'secret', 'token', 'sas'];
const credentialTokens = [
    'Token=',
    'DefaultEndpointsProtocol=http',
    'AccountKey=',
    'Data Source=',
    'Server=',
    'Password=',
    'pwd=',
    '&amp;sig=',
    '&sig=',
    '?sig=',
    'SharedAccessKey=',
    '&amp;code=',
    '&code=',
    '?code=',
    '/code=',
    'key=',
];
const urlCredentialPattern = /\b([a-zA-Z]+):\/\/([^:/\s]+):([^@/\s]+)@([^:/\s]+):([0-9]+)\b/g;

export function ensureErrorType(err: unknown): ValidatedError {
    if (err instanceof Error) {
        return err;
    } else {
        let message: string;
        if (err === undefined || err === null) {
            message = 'Unknown error';
        } else if (typeof err === 'string') {
            message = sanitizeErrorString(err);
        } else if (typeof err === 'object') {
            message = safeStringify(err);
        } else {
            message = sanitizeErrorString(String(err));
        }
        return new Error(message);
    }
}

export function sanitizeErrorString(input: string): string {
    if (!input) {
        return input;
    }

    let sanitized = input;
    for (const token of credentialTokens) {
        sanitized = replaceCredentialToken(sanitized, token);
    }

    return sanitized.replace(urlCredentialPattern, hiddenCredential);
}

function replaceCredentialToken(input: string, token: string): string {
    const lowerInput = input.toLowerCase();
    const lowerToken = token.toLowerCase();
    let startIndex = lowerInput.indexOf(lowerToken);
    if (startIndex === -1) {
        return input;
    }

    let sanitized = '';
    let searchOffset = 0;
    while (startIndex !== -1) {
        const credentialEnd = findCredentialEnd(input, startIndex);
        sanitized += input.substring(searchOffset, startIndex) + hiddenCredential;
        searchOffset = credentialEnd;
        startIndex = lowerInput.indexOf(lowerToken, searchOffset);
    }

    return sanitized + input.substring(searchOffset);
}

function findCredentialEnd(input: string, startIndex: number): number {
    const terminatorIndex = input.substring(startIndex).search(/[<"'\r\n]/);
    return terminatorIndex === -1 ? input.length : startIndex + terminatorIndex;
}

function safeStringify(value: object): string {
    const seen = new WeakSet<object>();
    return JSON.stringify(value, (key, val: unknown) => {
        if (isCredentialName(key)) {
            return hiddenCredential;
        }

        if (typeof val === 'string') {
            return sanitizeErrorString(val);
        }

        if (typeof val === 'bigint') {
            return val.toString();
        }

        if (typeof val === 'object' && val !== null) {
            if (seen.has(val)) {
                return circularReference;
            }
            seen.add(val);
        }

        return val;
    });
}

function isCredentialName(name: string): boolean {
    return credentialNameFragments.some((fragment) => name.toLowerCase().includes(fragment));
}

export function trySetErrorMessage(err: Error, message: string): void {
    try {
        err.message = message;
    } catch {
        // If we can't set the message, we'll keep the error as is
    }
}

/**
 * This is mostly for callbacks where `null` or `undefined` indicates there is no error
 * By contrast, anything thrown/caught is assumed to be an error regardless of what it is
 */
export function isError(err: unknown): boolean {
    return err !== null && err !== undefined;
}
