// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as fs from 'fs/promises';
import * as path from 'path';
import { TextDecoder } from 'util';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';

const maxContentBytes = 65536;
const Status = rpc.HostConfiguration.Status;

type FailureReason =
    | 'AppDirectoryUnavailable'
    | 'AppDirectoryNotSet'
    | 'AppDirectoryInvalid'
    | 'AppDirectoryNotFound'
    | 'AccessDenied'
    | 'OpenFailed'
    | 'ReadFailed'
    | 'InvalidEncoding'
    | 'InvalidJson'
    | 'Oversized';

interface Snapshot {
    status: rpc.HostConfiguration.Status;
    content?: Buffer;
    reason?: FailureReason;
}

export class HostConfigurationSnapshot {
    #pending?: Promise<Snapshot>;

    constructor(
        private readonly logWarning: (message: string) => void,
        private readonly getAppDirectory = () => {
            for (const setting of ['FUNCTIONS_APPLICATION_DIRECTORY', 'AzureWebJobsScriptRoot']) {
                const root = process.env[setting];
                if (root?.trim()) {
                    return root;
                }
            }
            return process.platform === 'linux' ? '/home/site/wwwroot' : undefined;
        }
    ) {}

    getConfiguration(request: rpc.IWorkerInitRequest): Promise<rpc.IHostConfiguration> | undefined {
        if (request.capabilities?.HostConfiguration !== '1') {
            return undefined;
        }

        this.#pending ??= this.capture().then((snapshot) => {
            if (snapshot.reason) {
                this.logWarning(
                    `Host configuration could not be delivered to the host. Reason: ${snapshot.reason}. The failure is retained until the worker process restarts.`
                );
            }
            return snapshot;
        });
        return this.#pending.then((snapshot) =>
            snapshot.content
                ? { status: snapshot.status, content: Buffer.from(snapshot.content) }
                : { status: snapshot.status }
        );
    }

    private async capture(): Promise<Snapshot> {
        let root: string | undefined;
        try {
            root = this.getAppDirectory();
        } catch {
            return failedSnapshot('AppDirectoryUnavailable');
        }

        let filePath: string;
        try {
            if (!root || !root.trim()) {
                return failedSnapshot('AppDirectoryNotSet');
            }

            const hasSeparator = root.endsWith(path.sep) || (path.sep === '\\' && root.endsWith('/'));
            const isDriveRelativeRoot = path.sep === '\\' && /^[a-z]:$/i.test(root);
            filePath = `${root}${hasSeparator || isDriveRelativeRoot ? '' : path.sep}host.json`;
        } catch {
            return failedSnapshot('AppDirectoryInvalid');
        }

        let file: fs.FileHandle;
        try {
            file = await fs.open(filePath, 'r');
        } catch (error) {
            // ENOENT can name the file or an absent parent. Only inspect the root after a failed open.
            if (errorCode(error) === 'ENOENT') {
                try {
                    return (await fs.stat(root)).isDirectory()
                        ? { status: Status.Missing }
                        : failedSnapshot('AppDirectoryNotFound');
                } catch (rootError) {
                    return failedSnapshot(openFailureReason(rootError));
                }
            }
            return failedSnapshot(openFailureReason(error));
        }

        try {
            try {
                return await readBounded(file);
            } finally {
                await file.close();
            }
        } catch {
            return failedSnapshot('ReadFailed');
        }
    }
}

function failedSnapshot(reason: FailureReason): Snapshot {
    return { status: reason === 'Oversized' ? Status.TooLarge : Status.Error, reason };
}

function errorCode(error: unknown): unknown {
    return error && typeof error === 'object' && 'code' in error ? error.code : undefined;
}

function openFailureReason(error: unknown): FailureReason {
    switch (errorCode(error)) {
        case 'ENOENT':
        case 'ENOTDIR':
            return 'AppDirectoryNotFound';
        case 'EACCES':
        case 'EPERM':
            return 'AccessDenied';
        default:
            return 'OpenFailed';
    }
}

async function readBounded(file: fs.FileHandle): Promise<Snapshot> {
    const input = Buffer.alloc(4096);
    let head = 0;
    while (head < 4) {
        const { bytesRead } = await file.read(input, head, 4 - head, null);
        if (!bytesRead) {
            break;
        }
        head += bytesRead;
    }

    let decoder: ReturnType<typeof createDecoder>;
    try {
        decoder = createDecoder(input.subarray(0, head));
    } catch {
        return failedSnapshot('InvalidEncoding');
    }
    const { bomLength, decode } = decoder;
    const output = Buffer.alloc(maxContentBytes);
    let length = 0;
    let bytes = input.subarray(bomLength, head);
    let final = false;
    for (;;) {
        let encoded: Buffer;
        try {
            encoded = Buffer.from(decode(bytes, final), 'utf8');
        } catch {
            return failedSnapshot('InvalidEncoding');
        }
        if (length + encoded.length > maxContentBytes) {
            return failedSnapshot('Oversized');
        }
        length += encoded.copy(output, length);
        if (final) {
            let content: Buffer;
            try {
                content = normalize(output.subarray(0, length).toString('utf8'));
            } catch {
                return failedSnapshot('InvalidJson');
            }
            return content.length > maxContentBytes
                ? failedSnapshot('Oversized')
                : { status: Status.Available, content };
        }

        const { bytesRead } = await file.read(input, 0, input.length, null);
        bytes = input.subarray(0, bytesRead);
        final = bytesRead === 0;
    }
}

function normalize(source: string): Buffer {
    const tokenPattern =
        /"(?:[^"\\]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null|[{}[\]:,]/y;
    const tokens: string[] = [];
    let depth = 0;
    let offset = 0;
    while (offset < source.length) {
        const char = source[offset];
        if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
            offset++;
            continue;
        }
        if (source.startsWith('//', offset)) {
            offset += 2;
            while (offset < source.length && source[offset] !== '\r' && source[offset] !== '\n') {
                if (source[offset] === '\u2028' || source[offset] === '\u2029') {
                    throw new SyntaxError('Invalid JSON comment');
                }
                offset++;
            }
            continue;
        }
        if (source.startsWith('/*', offset)) {
            const end = source.indexOf('*/', offset + 2);
            if (end < 0) {
                throw new SyntaxError('Unterminated JSON comment');
            }
            offset = end + 2;
            continue;
        }

        tokenPattern.lastIndex = offset;
        const match = tokenPattern.exec(source);
        if (!match) {
            throw new SyntaxError('Invalid JSON token');
        }
        const token = match[0];
        if (token === '[' || token === '{') {
            if (++depth > 64) {
                throw new SyntaxError('JSON depth exceeded');
            }
        } else if (token === ']' || token === '}') {
            depth--;
            const previous = tokens[tokens.length - 2];
            if (tokens[tokens.length - 1] === ',' && previous && !['[', '{', ':', ','].includes(previous)) {
                tokens.pop();
            }
        }
        tokens.push(token);
        offset = tokenPattern.lastIndex;
    }

    if (tokens[0] !== '{') {
        throw new SyntaxError('Host configuration must have an object root');
    }

    // Validate grammar only. Emitting parsed values would lose number lexemes, escapes, and duplicate keys.
    // Spaces preserve token boundaries so invalid input such as "1 2" cannot become a valid "12".
    JSON.parse(tokens.join(' '));
    return Buffer.from(tokens.join(''), 'utf8');
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
