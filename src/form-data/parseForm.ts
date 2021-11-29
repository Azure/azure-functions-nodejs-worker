// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { Readable } from 'stream';
import { getContentDispositionValues, getContentTypeFromHeader } from './parseContentType';

type FormEntry = {
    name: string;
    fileName?: string;
    contentType?: string;
    value: Readable;
};

export type FormEntrySimple = {
    name: string;
    fileName?: string;
    contentType?: string;
    value: string;
};

const carriageReturn = Buffer.from('\r')[0];
const newline = Buffer.from('\n')[0];
const hyphen = Buffer.from('-')[0];

export async function parseFormSimple(stream: Readable, boundary: string): Promise<FormEntrySimple[]> {
    const result = await parseForm(stream, boundary);
    return await Promise.all(
        result.map(async (v) => {
            const value = await streamToString(v.value);
            return {
                name: v.name,
                fileName: v.fileName,
                contentType: v.contentType,
                value,
            };
        })
    );
}

async function streamToString(stream: Readable): Promise<string> {
    const chunks: Buffer[] = [];
    await new Promise((resolve, reject) => {
        stream.on('data', (chunk) => {
            chunks.push(Buffer.from(chunk));
        });
        stream.on('error', reject);
        stream.on('end', resolve);
    });
    return Buffer.concat(chunks).toString();
}

export async function parseForm(stream: Readable, boundary: string): Promise<FormEntry[]> {
    let inHeaders = false;
    let entry: Partial<FormEntry> & { value: Readable } = {
        value: new Readable(),
    };
    const entries: FormEntry[] = [];

    const boundaryBuffer = Buffer.from(`--${boundary}`);
    const endBoundaryBuffer = Buffer.from(`--${boundary}--`);

    let lineStart = 0;
    let lineEnd = 0;

    let chunkToStreamStart = 0;
    let chunkToStreamEnd = 0;
    stream.on('data', (chunk: Buffer) => {
        for (let index = 0; index < chunk.length; index++) {
            let line: Buffer;
            if (chunk[index] === newline) {
                lineEnd = chunk[index - 1] === carriageReturn ? index - 1 : index;
                line = chunk.slice(lineStart, lineEnd);
                lineStart = index + 1;
            } else {
                continue;
            }

            const isBoundary = matchesBuffer(line, boundaryBuffer);
            const isBoundaryEnd = matchesBuffer(line, endBoundaryBuffer);
            if (isBoundary || isBoundaryEnd) {
                if (chunkToStreamEnd > chunkToStreamStart) {
                    entry.value.push(chunk.slice(chunkToStreamStart, chunkToStreamEnd));
                    entry.value.push(null);
                }
                entry = {
                    value: new Readable(),
                };
                inHeaders = true;
            } else if (inHeaders) {
                const lineAsString = line.toString();
                if (!lineAsString) {
                    inHeaders = false;
                    if (entry.name && entry.value) {
                        chunkToStreamStart = lineStart;
                        entries.push(<FormEntry>entry);
                    } else {
                        throw new Error('todo');
                    }
                } else {
                    // parse header
                    const contentDispositionValues = getContentDispositionValues(lineAsString);
                    if (contentDispositionValues) {
                        entry.name = contentDispositionValues.getValue('name');
                        entry.fileName = contentDispositionValues.tryGetValue('fileName');
                    } else {
                        const parsedContentType = getContentTypeFromHeader(lineAsString);
                        if (parsedContentType) {
                            entry.contentType = parsedContentType;
                        }
                    }
                }
            } else {
                chunkToStreamEnd = index;
            }
        }
    });

    return entries;
}

function matchesBuffer(buf1: Buffer, buf2: Buffer) {
    if (buf1.length !== buf2.length) {
        return false;
    } else {
        for (let index = 0; index < buf2.length; index++) {
            if (buf1[index] !== buf2[index]) {
                return false;
            }
        }
        return true;
    }
}
