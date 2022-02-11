// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { HeaderName } from '../constants';

const space = ' ';
// See "LEXICAL TOKENS" section for definition of ctl chars and quoted string: https://www.w3.org/Protocols/rfc822/3_Lexical.html
const ctlChars = '\\u0000-\\u001F\\u007F';
const quotedString = '(?:[^"\\\\]|\\\\.)*';
// General description of content type header, including defintion of tspecials and token https://www.w3.org/Protocols/rfc1341/4_Content-Type.html
const tspecials = '\\(\\)<>@,;:\\\\"\\/\\[\\]\\?\\.=';
const token = `[^${space}${ctlChars}${tspecials}]+`;

const start = '^\\s*'; // allows leading whitespace
const end = '\\s*(.*)$'; // gets the rest of the string except leading whitespace
const semicolonEnd = `\\s*;?${end}`; // allows optional semicolon and otherwise gets the rest of the string

/**
 * @param data a full header, e.g. "Content-Type: text/html; charset=UTF-8"
 * @param headerName the header name, e.g. "Content-Type"
 * @returns the header value, e.g. "text/html; charset=UTF-8" or null if not found
 */
export function getHeaderValue(data: string, headerName: string): string | null {
    const match = new RegExp(`${start}${headerName}\\s*:${end}`, 'i').exec(data);
    if (match) {
        return match[1].trim();
    }
    return null;
}

/**
 * @param data a content type, e.g. "text/html; charset=UTF-8"
 * @returns an array containing the media type (e.g. text/html) and an object with the parameters
 */
export function parseContentType(data: string): [string, HeaderParams] {
    const match = new RegExp(`${start}(${token}\\/${token})${semicolonEnd}`, 'i').exec(data);
    if (!match) {
        throw new Error(`${HeaderName.contentType} must begin with format "type/subtype".`);
    } else {
        return [match[1], parseHeaderParams(match[2])];
    }
}

/**
 * @param data a content disposition, e.g. "form-data; name=myfile; filename=test.txt"
 * @returns an array containing the disposition (e.g. form-data) and an object with the parameters
 */
export function parseContentDisposition(data: string): [string, HeaderParams] {
    const match = new RegExp(`${start}(${token})${semicolonEnd}`, 'i').exec(data);
    if (!match) {
        throw new Error(`${HeaderName.contentDisposition} must begin with disposition type.`);
    } else {
        return [match[1], parseHeaderParams(match[2])];
    }
}

function parseHeaderParams(data: string): HeaderParams {
    const result = new HeaderParams();
    while (data) {
        // try to find an unquoted name=value pair first
        const regexp = new RegExp(`${start}(${token})=(${token})${semicolonEnd}`, 'i');
        let match = regexp.exec(data);
        // if that didn't work, try to find a quoted name="value" pair instead
        if (!match) {
            const quotedPartsRegexp = new RegExp(`${start}(${token})="(${quotedString})"${semicolonEnd}`, 'i');
            match = quotedPartsRegexp.exec(data);
        }

        if (match) {
            result.add(match[1], match[2].replace(/\\"/g, '"')); // un-escape any quotes
            data = match[3];
        } else {
            break;
        }
    }
    return result;
}

export class HeaderParams {
    private _params: { [name: string]: string } = {};
    public get(name: string): string {
        const result = this._params[name.toLowerCase()];
        if (result === undefined) {
            throw new Error(`Failed to find parameter with name "${name}".`);
        } else {
            return result;
        }
    }

    public has(name: string): boolean {
        return this._params[name.toLowerCase()] !== undefined;
    }

    public add(name: string, value: string): void {
        this._params[name.toLowerCase()] = value;
    }
}
