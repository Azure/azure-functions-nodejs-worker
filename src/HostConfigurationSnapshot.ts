// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as fs from 'fs/promises';
import * as path from 'path';
import { TextDecoder } from 'util';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';

const maxContentBytes = 65536;
const Status = rpc.HostConfiguration.Status;

export class HostConfigurationSnapshot {
    #pending?: Promise<rpc.IHostConfiguration>;

    constructor(private readonly getAppDirectory = () => process.env.FUNCTIONS_APPLICATION_DIRECTORY) {}

    getConfiguration(request: rpc.IWorkerInitRequest): Promise<rpc.IHostConfiguration> | undefined {
        if (request.capabilities?.HostConfiguration !== '1') {
            return undefined;
        }

        this.#pending ??= this.capture();
        return this.#pending.then((snapshot) =>
            snapshot.content
                ? { status: snapshot.status, content: Buffer.from(snapshot.content) }
                : { status: snapshot.status }
        );
    }

    private async capture(): Promise<rpc.IHostConfiguration> {
        try {
            const root = this.getAppDirectory();
            if (!root || !root.trim()) {
                return { status: Status.Error };
            }

            let file: fs.FileHandle;
            try {
                file = await fs.open(path.format({ dir: root, base: 'host.json' }), 'r');
            } catch (error) {
                // ENOENT can name the file or an absent parent. Only inspect the root after a failed open.
                if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
                    return { status: (await fs.stat(root)).isDirectory() ? Status.Missing : Status.Error };
                }
                return { status: Status.Error };
            }

            try {
                return await readBounded(file);
            } finally {
                await file.close();
            }
        } catch {
            // Acquisition/conversion failures are explicit protocol outcomes, never path-bearing diagnostics.
            return { status: Status.Error };
        }
    }
}

async function readBounded(file: fs.FileHandle): Promise<rpc.IHostConfiguration> {
    const input = Buffer.alloc(4096);
    let head = 0;
    while (head < 4) {
        const { bytesRead } = await file.read({ buffer: input, offset: head, length: 4 - head, position: null });
        if (!bytesRead) {
            break;
        }
        head += bytesRead;
    }

    const { bomLength, decode } = createDecoder(input.subarray(0, head));
    const output = Buffer.alloc(maxContentBytes);
    let length = 0;
    let bytes = input.subarray(bomLength, head);
    let final = false;
    for (;;) {
        const encoded = Buffer.from(decode(bytes, final), 'utf8');
        if (length + encoded.length > maxContentBytes) {
            return { status: Status.TooLarge };
        }
        length += encoded.copy(output, length);
        if (final) {
            return { status: Status.Available, content: output.subarray(0, length) };
        }

        const { bytesRead } = await file.read({ buffer: input, offset: 0, length: input.length, position: null });
        bytes = input.subarray(0, bytesRead);
        final = bytesRead === 0;
    }
}

function createDecoder(head: Buffer): { bomLength: number; decode: (bytes: Buffer, final: boolean) => string } {
    // Test UTF-32LE first because it shares the UTF-16LE prefix.
    if (head.equals(Buffer.from([0xff, 0xfe, 0, 0])) || head.equals(Buffer.from([0, 0, 0xfe, 0xff]))) {
        const littleEndian = head[0] === 0xff;
        let pending: Buffer = Buffer.alloc(0);
        return {
            bomLength: 4,
            decode(bytes, final) {
                const input = Buffer.concat([pending, bytes]);
                const end = input.length - (input.length % 4);
                const codePoints: number[] = [];
                for (let offset = 0; offset < end; offset += 4) {
                    const value = littleEndian ? input.readUInt32LE(offset) : input.readUInt32BE(offset);
                    if (value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
                        throw new Error('Invalid UTF-32');
                    }
                    codePoints.push(value);
                }
                pending = Buffer.from(input.subarray(end));
                if (final && pending.length) {
                    throw new Error('Truncated UTF-32');
                }
                return String.fromCodePoint(...codePoints);
            },
        };
    }

    let encoding = 'utf-8';
    let bomLength = 0;
    if (head.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
        bomLength = 3;
    } else if (head.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) {
        encoding = 'utf-16le';
        bomLength = 2;
    } else if (head.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))) {
        encoding = 'utf-16be';
        bomLength = 2;
    }

    // We remove only the detected source BOM; a second U+FEFF is part of the content.
    const decoder = new TextDecoder(encoding, { fatal: true, ignoreBOM: true });
    return { bomLength, decode: (bytes, final) => decoder.decode(bytes, { stream: !final }) };
}
