// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

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

export function stringifySanitizedErrorObject(value: object): string {
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

function isCredentialName(name: string): boolean {
    return credentialNameFragments.some((fragment) => name.toLowerCase().includes(fragment));
}
