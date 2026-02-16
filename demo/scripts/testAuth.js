const http = require('http');
const crypto = require('crypto');

const account = 'devstoreaccount1';
const key = Buffer.from(
    'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==',
    'base64'
);
const container = 'test-auth';
const now = new Date().toUTCString();

// Path-style URL for Azurite: canonical resource must be /{account}/{account}/{container}
const canonicalResource = `/${account}/${account}/${container}`;

const stringToSign = [
    'PUT',
    '', // Content-Encoding
    '', // Content-Language
    '', // Content-Length (empty for zero-length body per Azurite/SDK behavior)
    '', // Content-MD5
    '', // Content-Type
    '', // Date
    '', // If-Modified-Since
    '', // If-Match
    '', // If-None-Match
    '', // If-Unmodified-Since
    '', // Range
    `x-ms-date:${now}`,
    'x-ms-version:2021-08-06',
    `${canonicalResource}\nrestype:container`,
].join('\n');

console.log('StringToSign repr:', JSON.stringify(stringToSign));
console.log('StringToSign bytes:', Buffer.from(stringToSign).length);

const sig = crypto.createHmac('sha256', key).update(stringToSign, 'utf8').digest('base64');
console.log('Signature:', sig);
console.log('Auth:', `SharedKey ${account}:${sig}`);

const req = http.request(
    {
        hostname: '127.0.0.1',
        port: 10000,
        path: `/${account}/${container}?restype=container`,
        method: 'PUT',
        headers: {
            'Content-Length': '0',
            'x-ms-date': now,
            'x-ms-version': '2021-08-06',
            Authorization: `SharedKey ${account}:${sig}`,
        },
    },
    (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
            console.log('Status:', res.statusCode);
            console.log('Body:', body);
        });
    }
);
req.on('error', (e) => console.error('Error:', e.message));
req.end();
