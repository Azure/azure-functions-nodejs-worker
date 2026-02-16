// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as http from 'http';
import * as https from 'https';
import { promisify } from 'util';
import { gzip } from 'zlib';
import { systemError } from '../utils/Logger';
import { RawLogPayload } from './types';

const gzipAsync = promisify(gzip);

/**
 * Interface for blob storage operations — allows swapping implementations.
 */
export interface IBlobStorageClient {
    uploadBlob(
        containerName: string,
        blobPath: string,
        content: Buffer,
        contentType: string,
        contentEncoding?: string
    ): Promise<string>;

    ensureContainer(containerName: string): Promise<void>;
}

/**
 * REST-based Blob Storage client using the Azure Blob REST API.
 * Authenticates via connection string (AccountName + AccountKey).
 */
export class RestBlobStorageClient implements IBlobStorageClient {
    #accountName: string;
    #accountKey: string;
    #baseUrl: string;
    #containerExistsCache = new Set<string>();
    #makeRequest: typeof http.request;
    #pathPrefix: string;

    constructor(connectionString: string) {
        const parts = this.#parseConnectionString(connectionString);
        this.#accountName = parts.accountName;
        this.#accountKey = parts.accountKey;
        this.#baseUrl = parts.blobEndpoint || `https://${parts.accountName}.blob.core.windows.net`;
        this.#makeRequest = this.#baseUrl.startsWith('http://') ? http.request : https.request;

        // For path-style URLs (e.g. Azurite: http://127.0.0.1:10000/devstoreaccount1),
        // the URL pathname already contains the account name. The canonical resource
        // must be /{accountName} + {URL-pathname}, which doubles the account name.
        const parsed = new URL(this.#baseUrl);
        this.#pathPrefix = `/${this.#accountName}${parsed.pathname === '/' ? '' : parsed.pathname}`;
    }

    /**
     * Well-known Azurite / Storage Emulator connection string.
     * When the user supplies "UseDevelopmentStorage=true" we expand it to the
     * full dev-store connection string so the rest of the code works unchanged.
     */
    static readonly #DEV_STORAGE_CONNECTION_STRING =
        'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;' +
        'AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;' +
        'BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;';

    #parseConnectionString(connStr: string): {
        accountName: string;
        accountKey: string;
        blobEndpoint?: string;
    } {
        // Expand the well-known development storage shorthand
        if (connStr.trim().toLowerCase() === 'usedevelopmentstorage=true') {
            connStr = RestBlobStorageClient.#DEV_STORAGE_CONNECTION_STRING;
        }

        const pairs: Record<string, string> = {};
        for (const part of connStr.split(';')) {
            const eqIdx = part.indexOf('=');
            if (eqIdx > 0) {
                const key = part.substring(0, eqIdx).trim();
                const value = part.substring(eqIdx + 1).trim();
                pairs[key] = value;
            }
        }

        if (!pairs['AccountName'] || !pairs['AccountKey']) {
            throw new Error('Blob Storage connection string must contain AccountName and AccountKey.');
        }

        return {
            accountName: pairs['AccountName'],
            accountKey: pairs['AccountKey'],
            blobEndpoint: pairs['BlobEndpoint'],
        };
    }

    async ensureContainer(containerName: string): Promise<void> {
        if (this.#containerExistsCache.has(containerName)) {
            return;
        }

        try {
            const url = `${this.#baseUrl}/${containerName}?restype=container`;
            const { createHmac } = await import('crypto');

            const now = new Date().toUTCString();
            const signParts = [
                'PUT',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                `x-ms-date:${now}`,
                `x-ms-version:2021-08-06`,
                `${this.#pathPrefix}/${containerName}`,
                `restype:container`,
            ];
            const stringToSign = signParts.join('\n');

            const key = Buffer.from(this.#accountKey, 'base64');
            const signature = createHmac('sha256', key as any)
                .update(stringToSign, 'utf8')
                .digest('base64');

            await new Promise<void>((resolve, reject) => {
                const parsedUrl = new URL(url);
                const req = this.#makeRequest(
                    {
                        hostname: parsedUrl.hostname,
                        port: parsedUrl.port || undefined,
                        path: parsedUrl.pathname + parsedUrl.search,
                        method: 'PUT',
                        headers: {
                            'Content-Length': '0',
                            'x-ms-date': now,
                            'x-ms-version': '2021-08-06',
                            Authorization: `SharedKey ${this.#accountName}:${signature}`,
                        },
                    },
                    (res) => {
                        if (res.statusCode === 201 || res.statusCode === 409) {
                            resolve();
                        } else {
                            let body = '';
                            res.on('data', (chunk: Buffer) => (body += chunk.toString()));
                            res.on('end', () => {
                                reject(new Error(`Create container failed (${res.statusCode}): ${body}`));
                            });
                        }
                        res.resume();
                    }
                );
                req.on('error', reject);
                req.end();
            });

            this.#containerExistsCache.add(containerName);
        } catch (err) {
            systemError(`Failed to ensure blob container '${containerName}':`, err);
            throw err;
        }
    }

    async uploadBlob(
        containerName: string,
        blobPath: string,
        content: Buffer,
        contentType: string,
        contentEncoding?: string
    ): Promise<string> {
        const url = `${this.#baseUrl}/${containerName}/${blobPath}`;
        const { createHmac } = await import('crypto');

        const now = new Date().toUTCString();
        const contentLength = content.length;
        const signParts = [
            'PUT',
            contentEncoding || '',
            '',
            contentLength.toString(),
            '',
            contentType,
            '',
            '',
            '',
            '',
            '',
            '',
            `x-ms-blob-type:BlockBlob`,
            `x-ms-date:${now}`,
            `x-ms-version:2021-08-06`,
            `${this.#pathPrefix}/${containerName}/${blobPath}`,
        ];
        const stringToSign = signParts.join('\n');

        const key = Buffer.from(this.#accountKey, 'base64');
        const signature = createHmac('sha256', key as any)
            .update(stringToSign, 'utf8')
            .digest('base64');

        const headers: Record<string, string | number> = {
            'Content-Type': contentType,
            'Content-Length': contentLength,
            'x-ms-blob-type': 'BlockBlob',
            'x-ms-date': now,
            'x-ms-version': '2021-08-06',
            Authorization: `SharedKey ${this.#accountName}:${signature}`,
        };

        if (contentEncoding) {
            headers['Content-Encoding'] = contentEncoding;
        }

        await new Promise<void>((resolve, reject) => {
            const parsedUrl = new URL(url);
            const req = this.#makeRequest(
                {
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port || undefined,
                    path: parsedUrl.pathname,
                    method: 'PUT',
                    headers,
                },
                (res) => {
                    if (res.statusCode === 201) {
                        resolve();
                    } else {
                        let body = '';
                        res.on('data', (chunk: Buffer) => (body += chunk.toString()));
                        res.on('end', () => {
                            reject(new Error(`Blob upload failed (${res.statusCode}): ${body}`));
                        });
                    }
                    res.resume();
                }
            );
            req.on('error', reject);
            req.write(content);
            req.end();
        });

        return url;
    }
}

/**
 * Writes raw invocation logs to Azure Blob Storage.
 */
export class BlobLogWriter {
    #client: IBlobStorageClient;
    #containerName: string;
    #compress: boolean;
    #containerReady = false;
    #maxRetries: number;

    constructor(client: IBlobStorageClient, containerName: string, compress = true, maxRetries = 3) {
        this.#client = client;
        this.#containerName = containerName;
        this.#compress = compress;
        this.#maxRetries = maxRetries;
    }

    #buildBlobPath(functionName: string, invocationId: string, date: Date): string {
        const dateStr = date.toISOString().substring(0, 10);
        const safeFnName = functionName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const extension = this.#compress ? '.json.gz' : '.json';
        return `logs/${dateStr}/${safeFnName}/${invocationId}${extension}`;
    }

    async writeLogPayload(payload: RawLogPayload): Promise<string | undefined> {
        try {
            if (!this.#containerReady) {
                await this.#client.ensureContainer(this.#containerName);
                this.#containerReady = true;
            }

            const jsonStr = JSON.stringify(payload);
            let content: Buffer;
            let contentType: string;
            let contentEncoding: string | undefined;

            if (this.#compress) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                content = (await gzipAsync(Buffer.from(jsonStr, 'utf-8') as any)) as unknown as Buffer;
                contentType = 'application/json';
                contentEncoding = 'gzip';
            } else {
                content = Buffer.from(jsonStr, 'utf-8');
                contentType = 'application/json';
            }

            const blobPath = this.#buildBlobPath(
                payload.functionName,
                payload.invocationId,
                new Date(payload.startTime)
            );

            let lastError: Error | undefined;
            for (let attempt = 0; attempt < this.#maxRetries; attempt++) {
                try {
                    const uri = await this.#client.uploadBlob(
                        this.#containerName,
                        blobPath,
                        content,
                        contentType,
                        contentEncoding
                    );
                    return uri;
                } catch (err) {
                    lastError = err instanceof Error ? err : new Error(String(err));
                    const delay = 100 * Math.pow(2, attempt);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                }
            }

            systemError(
                `Failed to write logs to blob after ${this.#maxRetries} retries for invocation ` +
                    `${payload.invocationId}:`,
                lastError
            );
            return undefined;
        } catch (err) {
            systemError(`BlobLogWriter.writeLogPayload failed for invocation ${payload.invocationId}:`, err);
            return undefined;
        }
    }
}

/**
 * No-op blob writer for when the pipeline is disabled.
 */
export class NoOpBlobLogWriter extends BlobLogWriter {
    constructor() {
        super(
            {
                async uploadBlob() {
                    return '';
                },
                async ensureContainer() {
                    // no-op
                },
            },
            'noop',
            false,
            1
        );
    }

    async writeLogPayload(_payload: RawLogPayload): Promise<string | undefined> {
        return undefined;
    }
}
