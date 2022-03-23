// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as types from '@azure/functions';
import { MediaType } from '../constants';
import { parseContentType } from './parseHeader';
import { parseMultipartForm } from './parseMultipartForm';

/**
 * See ./test/parseForm.test.ts for examples
 */
export function parseForm(data: Buffer | string, contentType: string): Form {
    const [mediaType, parameters] = parseContentType(contentType);
    switch (mediaType.toLowerCase()) {
        case MediaType.multipartForm: {
            const boundary = parameters.get('boundary');
            const parts = parseMultipartForm(typeof data === 'string' ? Buffer.from(data) : data, boundary);
            return new Form(parts);
        }
        case MediaType.urlEncodedForm: {
            const parsed = new URLSearchParams(data.toString());
            const parts: [string, types.FormPart][] = [];
            for (const [key, value] of parsed) {
                parts.push([key, { value: Buffer.from(value) }]);
            }
            return new Form(parts);
        }
        default:
            throw new Error(
                `Media type "${mediaType}" does not match types supported for form parsing: "${MediaType.multipartForm}", "${MediaType.urlEncodedForm}".`
            );
    }
}

export class Form implements types.Form {
    #parts: [string, types.FormPart][];
    constructor(parts: [string, types.FormPart][]) {
        this.#parts = parts;
    }

    public get(name: string): types.FormPart | null {
        for (const [key, value] of this.#parts) {
            if (key === name) {
                return value;
            }
        }
        return null;
    }

    public getAll(name: string): types.FormPart[] {
        const result: types.FormPart[] = [];
        for (const [key, value] of this.#parts) {
            if (key === name) {
                result.push(value);
            }
        }
        return result;
    }

    public has(name: string): boolean {
        for (const [key] of this.#parts) {
            if (key === name) {
                return true;
            }
        }
        return false;
    }

    [Symbol.iterator](): Iterator<[string, types.FormPart]> {
        return this.#parts[Symbol.iterator]();
    }

    public get length(): number {
        return this.#parts.length;
    }
}
