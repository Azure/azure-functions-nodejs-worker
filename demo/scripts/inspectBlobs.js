/**
 * inspectBlobs.js
 *
 * Reads blobs from the local Azurite "function-logs" container and prints
 * their contents so you can verify the pipeline wrote raw log payloads.
 *
 * Usage:
 *   node scripts/inspectBlobs.js
 *   node scripts/inspectBlobs.js --container function-logs
 *   node scripts/inspectBlobs.js --latest        # show only the most recent blob
 */

const http = require('http');
const crypto = require('crypto');
const { gunzipSync } = require('zlib');

const ACCOUNT = 'devstoreaccount1';
const KEY = Buffer.from(
    'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==',
    'base64'
);
const HOST = '127.0.0.1';
const PORT = 10000;
const VERSION = '2021-08-06';

const args = process.argv.slice(2);
const containerName = getArg('--container') || 'function-logs';
const showLatest = args.includes('--latest');

function getArg(flag) {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

/**
 * Build a SharedKey Authorization header for Azurite (path-style URLs).
 * Canonical resource for path-style: /{account}/{account}/{path}
 */
function buildAuth(method, path, date) {
    // path is e.g. /function-logs?restype=container&comp=list
    const [pathPart, queryPart] = path.split('?');
    // Azurite path-style canonical resource: /{account}/{account}{pathPart}
    let canonicalResource = `/${ACCOUNT}/${ACCOUNT}${pathPart}`;
    // Sort query params and append as \nparam:value
    if (queryPart) {
        const params = queryPart
            .split('&')
            .map((p) => p.split('='))
            .sort(([a], [b]) => a.localeCompare(b));
        for (const [k, v] of params) {
            canonicalResource += `\n${k}:${v}`;
        }
    }

    const stringToSign = [
        method, // HTTP verb
        '', // Content-Encoding
        '', // Content-Language
        '', // Content-Length (empty for GET)
        '', // Content-MD5
        '', // Content-Type
        '', // Date
        '', // If-Modified-Since
        '', // If-Match
        '', // If-None-Match
        '', // If-Unmodified-Since
        '', // Range
        `x-ms-date:${date}`,
        `x-ms-version:${VERSION}`,
        canonicalResource,
    ].join('\n');

    const sig = crypto.createHmac('sha256', KEY).update(stringToSign, 'utf8').digest('base64');
    return `SharedKey ${ACCOUNT}:${sig}`;
}

function azuriteRequest(method, path) {
    return new Promise((resolve, reject) => {
        const date = new Date().toUTCString();
        const options = {
            hostname: HOST,
            port: PORT,
            path: `/${ACCOUNT}${path}`,
            method,
            headers: {
                'x-ms-date': date,
                'x-ms-version': VERSION,
                Authorization: buildAuth(method, path, date),
            },
        };

        const req = http.request(options, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const body = Buffer.concat(chunks);
                resolve({ status: res.statusCode, headers: res.headers, body });
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function listBlobs() {
    const res = await azuriteRequest('GET', `/${containerName}?restype=container&comp=list`);
    if (res.status === 404) {
        console.log(`Container "${containerName}" does not exist yet. Trigger a function first.`);
        process.exit(0);
    }
    const xml = res.body.toString();
    // Simple XML parse to extract blob names
    const names = [];
    const regex = /<Name>(.*?)<\/Name>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
        names.push(match[1]);
    }
    return names;
}

async function getBlob(blobName) {
    const res = await azuriteRequest('GET', `/${containerName}/${blobName}`);
    if (res.status !== 200) {
        console.error(`Failed to get blob "${blobName}": HTTP ${res.status}`);
        return null;
    }

    let content = res.body;
    // Decompress if gzipped
    const encoding = res.headers['content-encoding'];
    if (encoding === 'gzip' || blobName.endsWith('.gz')) {
        try {
            content = gunzipSync(content);
        } catch {
            // Not gzipped, use as-is
        }
    }

    try {
        return JSON.parse(content.toString());
    } catch {
        return content.toString();
    }
}

async function main() {
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║  Pipeline Demo — Blob Storage Inspector      ║`);
    console.log(`╚══════════════════════════════════════════════╝\n`);
    console.log(`Container: ${containerName}`);
    console.log(`Azurite:   http://${HOST}:${PORT}/${ACCOUNT}\n`);

    const blobs = await listBlobs();

    if (blobs.length === 0) {
        console.log('No blobs found. Trigger the PipelineDemo function first:');
        console.log('  curl http://localhost:7071/api/PipelineDemo\n');
        return;
    }

    console.log(`Found ${blobs.length} blob(s):\n`);

    const toShow = showLatest ? [blobs[blobs.length - 1]] : blobs;

    for (const name of toShow) {
        console.log(`── ${name} ${'─'.repeat(Math.max(0, 60 - name.length))}`);
        const content = await getBlob(name);
        if (content && typeof content === 'object') {
            // Show summary
            console.log(`  Function:     ${content.functionName || '?'}`);
            console.log(`  InvocationId: ${content.invocationId || '?'}`);
            console.log(`  Timestamp:    ${content.timestamp || '?'}`);
            console.log(`  Log entries:  ${(content.logs || []).length}`);
            if (content.logs && content.logs.length > 0) {
                console.log(`  First log:    [${content.logs[0].level}] ${content.logs[0].message}`);
                if (content.logs.length > 1) {
                    const last = content.logs[content.logs.length - 1];
                    console.log(`  Last log:     [${last.level}] ${last.message}`);
                }
            }
            if (content.error) {
                console.log(`  Error:        ${content.error.message}`);
            }
        } else {
            console.log(`  ${String(content).substring(0, 200)}`);
        }
        console.log();
    }

    console.log(`\nTo see full JSON of a blob:`);
    console.log(`  curl http://${HOST}:${PORT}/${ACCOUNT}/${containerName}/<blob-name>\n`);
}

main().catch((err) => {
    console.error('Error:', err.message);
    console.error('\nIs Azurite running? Start it with: azurite --silent --location ./azurite-data');
    process.exit(1);
});
