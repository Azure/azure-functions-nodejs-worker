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

export type ParseFormOptions = {
    onEntry(entry: FormEntry): Promise<void>;
};

const carriageReturn = Buffer.from('\r')[0];
const newline = Buffer.from('\n')[0];
const hyphen = Buffer.from('-')[0];

export async function parseFormSimple(stream: Readable, boundary: string): Promise<FormEntrySimple[]> {
    const result: Promise<FormEntrySimple>[] = [];
    await parseForm(stream, boundary, {
        onEntry: async (entry) => {
            result.push(onEntry(entry));
        },
    });
    return await Promise.all(result);
}

async function onEntry(entry: FormEntry): Promise<FormEntrySimple> {
    const value = await streamToString(entry.value);
    return {
        name: entry.name,
        fileName: entry.fileName,
        contentType: entry.contentType,
        value,
    };
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

export async function parseForm(stream: Readable, boundary: string, options: ParseFormOptions): Promise<void> {
    let inHeaders = false;
    let entry: Partial<FormEntry> & { value: Readable } = {
        value: new Readable(),
    };

    const boundaryBuffer = Buffer.from(`--${boundary}`);
    const endBoundaryBuffer = Buffer.from(`--${boundary}--`);

    let prevBufferLine: Buffer | undefined;
    let prevBufferEOL: Buffer | undefined;
    await new Promise((resolve, reject) => {
        stream.on('data', (chunk: Buffer) => {
            try {
                let lineStart = 0;
                let lineEnd = 0;

                let chunkToStreamStart = 0;
                let chunkToStreamEnd = 0;

                for (let index = 0; index < chunk.length; index++) {
                    let line: Buffer;
                    if (chunk[index] === newline) {
                        lineEnd = chunk[index - 1] === carriageReturn ? index - 1 : index;
                        line = chunk.slice(lineStart, lineEnd);
                        if (prevBufferLine) {
                            line = Buffer.concat([prevBufferLine, line]);
                        }
                        lineStart = index + 1;
                    } else {
                        continue;
                    }

                    const isBoundary = matchesBuffer(line, boundaryBuffer);
                    const isBoundaryEnd = matchesBuffer(line, endBoundaryBuffer);
                    if (isBoundary || isBoundaryEnd) {
                        if (chunkToStreamEnd > chunkToStreamStart) {
                            entry.value.push(chunk.slice(chunkToStreamStart, chunkToStreamEnd));
                        }
                        entry.value.push(null);

                        if (isBoundaryEnd) {
                            return;
                        }

                        const readable = new Readable();
                        readable._read = () => {};
                        entry = {
                            value: readable,
                        };
                        inHeaders = true;
                    } else if (inHeaders) {
                        const lineAsString = line.toString();
                        if (!lineAsString) {
                            inHeaders = false;
                            if (entry.name && entry.value) {
                                chunkToStreamStart = lineStart;
                                options.onEntry(<FormEntry>entry);
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
                        if (prevBufferLine) {
                            entry.value.push(
                                prevBufferEOL ? Buffer.concat([prevBufferEOL, prevBufferLine]) : prevBufferLine
                            );
                        }
                    }
                    prevBufferLine = undefined;
                    prevBufferEOL = undefined;
                }

                if (lineEnd > 0) {
                    // We've processed several lines already - just need to keep track of the last bit
                    if (!inHeaders) {
                        entry.value.push(chunk.slice(chunkToStreamStart, lineEnd));
                    }

                    const partialLine = chunk.slice(lineStart, chunk.length);
                    prevBufferLine = prevBufferLine ? Buffer.concat([prevBufferLine, partialLine]) : partialLine;
                    if (lineEnd > chunkToStreamStart) {
                        prevBufferEOL = chunk.slice(lineEnd, lineStart);
                    }
                } else if (lineStart < chunk.length) {
                    // The chunk must've been less than a single line
                    prevBufferLine = prevBufferLine ? Buffer.concat([prevBufferLine, chunk]) : chunk;
                }
            } catch (error) {
                reject(error);
            }
        });
        stream.on('end', resolve);
    });
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
