// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { FormPart } from '@azure/functions';
import { HeaderName } from '../constants';
import { getHeaderValue, parseContentDisposition } from './parseHeader';

const carriageReturn = Buffer.from('\r')[0];
const newline = Buffer.from('\n')[0];

// multipart/form-data specification https://datatracker.ietf.org/doc/html/rfc7578
export async function parseMultipartForm(chunk: Buffer, boundary: string): Promise<[string, FormPart][]> {
    const result: [string, FormPart][] = [];
    let currentName: string | undefined;
    let currentPart: FormPart | undefined;
    let inHeaders = false;

    const boundaryBuffer = Buffer.from(`--${boundary}`);
    const endBoundaryBuffer = Buffer.from(`--${boundary}--`);

    let lineStart = 0;
    let lineEnd = 0;
    let partValueStart = 0;
    let partValueEnd = 0;

    for (let index = 0; index < chunk.length; index++) {
        let line: Buffer;
        if (chunk[index] === newline) {
            lineEnd = chunk[index - 1] === carriageReturn ? index - 1 : index;
            line = chunk.slice(lineStart, lineEnd);
            lineStart = index + 1;
        } else {
            continue;
        }

        const isBoundary = line.equals(boundaryBuffer);
        const isBoundaryEnd = line.equals(endBoundaryBuffer);
        if (isBoundary || isBoundaryEnd) {
            if (currentPart) {
                currentPart.value = chunk.slice(partValueStart, partValueEnd);
            }

            if (isBoundaryEnd) {
                break;
            }

            currentPart = {
                value: Buffer.from(''),
            };
            inHeaders = true;
        } else if (inHeaders) {
            if (!currentPart) {
                throw new Error(`Expected form data to start with boundary "${boundary}".`);
            }

            const lineAsString = line.toString();
            if (!lineAsString) {
                // A blank line means we're done with the headers for this part
                inHeaders = false;
                if (!currentName) {
                    throw new Error(
                        `Expected part to have header "${HeaderName.contentDisposition}" with parameter "name".`
                    );
                } else {
                    partValueStart = lineStart;
                    partValueEnd = lineStart;
                    result.push([currentName, currentPart]);
                }
            } else {
                const contentDisposition = getHeaderValue(lineAsString, HeaderName.contentDisposition);
                if (contentDisposition) {
                    const [, dispositionParts] = parseContentDisposition(contentDisposition);
                    currentName = dispositionParts.get('name');

                    // filename is optional, even for files
                    if (dispositionParts.has('fileName')) {
                        currentPart.fileName = dispositionParts.get('fileName');
                    }
                } else {
                    const contentType = getHeaderValue(lineAsString, HeaderName.contentType);
                    if (contentType) {
                        currentPart.contentType = contentType;
                    }
                }
            }
        } else {
            partValueEnd = lineEnd;
        }
    }

    return result;
}
