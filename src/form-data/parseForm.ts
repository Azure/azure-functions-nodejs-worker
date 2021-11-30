// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { FormPart, ParseFormBodyOptions } from '@azure/functions';
import { Readable } from 'stream';
import { getContentDispositionValues, getContentTypeFromHeader } from './parseContentType';

const carriageReturn = Buffer.from('\r')[0];
const newline = Buffer.from('\n')[0];
const hyphen = Buffer.from('-')[0];

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

async function handlePart(
    part: FormPart,
    stream: Readable,
    options: ParseFormBodyOptions | undefined
): Promise<FormPart> {
    if (options?.onPart) {
        await options.onPart(part, stream);
    } else {
        part.value = await streamToString(stream);
    }
    return part;
}

export async function parseForm(
    stream: Readable,
    boundary: string,
    options?: ParseFormBodyOptions
): Promise<FormPart[]> {
    let inHeaders = false;
    let part: Partial<FormPart> = {};
    let partStream: Readable = new Readable();
    partStream._read = () => {};

    const boundaryBuffer = Buffer.from(`--${boundary}`);
    const endBoundaryBuffer = Buffer.from(`--${boundary}--`);

    const results: Promise<FormPart>[] = [];

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
                            partStream.push(chunk.slice(chunkToStreamStart, chunkToStreamEnd));
                        }
                        partStream.push(null);
                        if (isBoundaryEnd) {
                            return;
                        }

                        part = {};
                        partStream = new Readable();
                        partStream._read = () => {};
                        inHeaders = true;
                    } else if (inHeaders) {
                        const lineAsString = line.toString();
                        if (!lineAsString) {
                            inHeaders = false;
                            if (part.name) {
                                chunkToStreamStart = lineStart;
                                results.push(handlePart(<FormPart>part, partStream, options));
                            } else {
                                throw new Error('todo');
                            }
                        } else {
                            // parse header
                            const contentDispositionValues = getContentDispositionValues(lineAsString);
                            if (contentDispositionValues) {
                                part.name = contentDispositionValues.getValue('name');
                                part.fileName = contentDispositionValues.tryGetValue('fileName');
                            } else {
                                const parsedContentType = getContentTypeFromHeader(lineAsString);
                                if (parsedContentType) {
                                    part.contentType = parsedContentType;
                                }
                            }
                        }
                    } else {
                        chunkToStreamEnd = index;
                        if (prevBufferLine) {
                            partStream.push(
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
                        partStream.push(chunk.slice(chunkToStreamStart, lineEnd));
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
    return await Promise.all(results);
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
