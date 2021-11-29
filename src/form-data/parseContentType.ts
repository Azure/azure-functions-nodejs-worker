// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

const space = ' ';
// https://www.w3.org/Protocols/rfc822/3_Lexical.html
const ctlChars = '\\u0000-\\u001F\\u007F';
// https://www.w3.org/Protocols/rfc822/Overview.html#z6
const quotedString = '(?:[^"\\\\]|\\\\.)*';
// https://www.w3.org/Protocols/rfc1341/4_Content-Type.html
const tspecials = '\\(\\)<>@,;:\\\\"\\/\\[\\]\\?\\.=';
const token = `[^${space}${ctlChars}${tspecials}]+`;

export function getContentType(data: string): string {
    return parseContentType(data)[0];
}

export function getFormBoundary(data: string): string {
    const [, parts] = parseContentType(data);
    return parts.getValue('boundary');
}

const start = '^\\s*'; // allows leading whitespace
const end = '(.*)$'; // allows optional semicolon and otherwise gets the rest of the string
const semicolonEnd = `;?${end}`; // allows optional semicolon and otherwise gets the rest of the string

function parseContentType(data: string): [string, HeaderParts] {
    const regexp = new RegExp(`${start}(${token}\\/${token})${semicolonEnd}`, 'i');
    const match = regexp.exec(data);
    if (!match) {
        throw new Error(`Failed to find content-type.`);
    } else {
        return [match[1], parseHeaderParts(match[2])];
    }
}

// todo somehow make this case insensitive
export function getContentDispositionValues(data: string): HeaderParts | undefined {
    const match = new RegExp(`${start}Content-Disposition: form-data${semicolonEnd}`, 'i').exec(data);
    return match ? parseHeaderParts(match[1]) : undefined;
}

export function getContentTypeFromHeader(data: string): string | undefined {
    const match = new RegExp(`${start}Content-type:(.*)$`, 'i').exec(data);
    if (match) {
        return getContentType(match[1]);
    }
    return undefined;
}

function parseHeaderParts(data: string): HeaderParts {
    const parts = new HeaderParts();
    while (data) {
        const regexp = new RegExp(`${start}(${token})=(${token})${semicolonEnd}`, 'i');
        let match = regexp.exec(data);
        if (!match) {
            const quotedPartsRegexp = new RegExp(`${start}(${token})="(${quotedString})"${semicolonEnd}`, 'i');
            match = quotedPartsRegexp.exec(data);
        }

        if (match) {
            parts.addValue(match[1], match[2].replace(/\\"/g, '"'));
            data = match[3];
        } else {
            break;
        }
    }
    return parts;
}

export class HeaderParts {
    private _parts: { [name: string]: string } = {};
    public getValue(name: string): string {
        const result = this.tryGetValue(name);
        if (!result) {
            throw new Error(`Failed to find part with name "${name}".`);
        } else {
            return result;
        }
    }
    public tryGetValue(name: string): string | undefined {
        return this._parts[name.toLowerCase()];
    }
    public addValue(name: string, value: string): void {
        this._parts[name.toLowerCase()] = value;
    }
}
