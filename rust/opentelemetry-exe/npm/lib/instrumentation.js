// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

'use strict';

// Opt-in client hooks. Node.js only observes outgoing calls and reports their timing;
// the azfunc-otel sidecar builds and exports the spans.

const { randomBytes } = require('node:crypto');
const diagnostics = require('node:diagnostics_channel');

const maxUrlLength = 1024;

const nowNs = () => BigInt(Math.round((performance.timeOrigin + performance.now()) * 1e6)).toString();

function newSpanId() {
    let id;
    do {
        id = randomBytes(8).toString('hex');
    } while (id === '0000000000000000');
    return id;
}

function newTraceId() {
    let id;
    do {
        id = randomBytes(16).toString('hex');
    } while (id === '00000000000000000000000000000000');
    return id;
}

function traceparent(traceId, spanId, sampled) {
    return `00-${traceId}-${spanId}-${sampled ? '01' : '00'}`;
}

// Query values and fragments often carry tokens or SAS signatures, so only parameter names are exported.
function sanitizeUrl(value) {
    let sanitized;
    try {
        const url = new URL(value);
        url.username = '';
        url.password = '';
        url.hash = '';
        const keys = [...url.searchParams.keys()];
        url.search = keys.map((key) => `${encodeURIComponent(key)}=REDACTED`).join('&');
        sanitized = url.toString();
    } catch {
        sanitized = String(value)
            .split(/[?#]/, 1)[0]
            .replace(/^([^:/?#]+:\/\/)[^/@]*@/, '$1');
    }
    return sanitized.length > maxUrlLength ? sanitized.slice(0, maxUrlLength) : sanitized;
}

function hasHeader(headers, name) {
    if (Array.isArray(headers)) {
        for (let i = 0; i < headers.length; i += 2) {
            if (String(headers[i]).toLowerCase() === name) return true;
        }
        return false;
    }
    return typeof headers === 'string' && headers.toLowerCase().includes(`\r\n${name}:`);
}

/**
 * Installs the selected client hooks.
 * @param {Set<string>} kinds Any of `http`, `dns` and `fetch`.
 * @param {() => object | undefined} active Returns the active invocation span, if any.
 * @param {(record: object) => void} send Sends a finished span record to the sidecar.
 */
function install(kinds, active, send) {
    const start = (name, attributes) => {
        const parent = active();
        if (!parent) return undefined;
        return { name, parent, spanId: newSpanId(), startNs: nowNs(), attributes, ended: false };
    };
    const finish = (span, error) => {
        if (!span || span.ended) return;
        span.ended = true;
        // Unsampled traces still propagate traceparent but are not exported.
        if (!span.parent.sampled) return;
        if (error && !span.attributes['error.type']) span.attributes['error.type'] = String(error);
        send({
            t: 'span',
            kind: 'client',
            name: span.name,
            traceId: span.parent.traceId,
            spanId: span.spanId,
            parentSpanId: span.parent.spanId,
            traceState: span.parent.traceState,
            startNs: span.startNs,
            endNs: nowNs(),
            error: error ? String(error).slice(0, 256) : undefined,
            attributes: span.attributes,
        });
    };
    const statusError = (span, status) => {
        span.attributes['http.response.status_code'] = status;
        return status >= 400 ? String(status) : undefined;
    };
    const header = (span) => traceparent(span.parent.traceId, span.spanId, span.parent.sampled);

    if (kinds.has('http')) {
        const spans = new WeakMap();
        diagnostics.subscribe('http.client.request.created', ({ request }) => {
            const host = String(request.getHeader('host') ?? request.host ?? '');
            const protocol = request.protocol ?? 'http:';
            const [address, port] = host.startsWith('[')
                ? [host.slice(1, host.indexOf(']')), host.slice(host.indexOf(']') + 2)]
                : host.split(':');
            const span = start(request.method, {
                'http.request.method': request.method,
                'url.full': sanitizeUrl(`${protocol}//${host}${request.path}`),
                'server.address': address || request.host,
                'server.port': Number(port) || (protocol === 'https:' ? 443 : 80),
            });
            if (!span) return;
            if (!request.getHeader('traceparent')) request.setHeader('traceparent', header(span));
            spans.set(request, span);
        });
        diagnostics.subscribe('http.client.response.finish', ({ request, response }) => {
            const span = spans.get(request);
            if (span) finish(span, statusError(span, response.statusCode));
        });
        diagnostics.subscribe('http.client.request.error', ({ request, error }) => {
            const span = spans.get(request);
            if (span) span.attributes['error.type'] = error?.code ?? error?.name ?? 'Error';
            finish(span, error?.code ?? error?.message ?? 'Error');
        });
    }

    if (kinds.has('fetch')) {
        const spans = new WeakMap();
        diagnostics.subscribe('undici:request:create', ({ request }) => {
            let origin;
            try {
                origin = new URL(String(request.origin));
            } catch {
                return;
            }
            const span = start(request.method, {
                'http.request.method': request.method,
                'url.full': sanitizeUrl(`${origin.origin}${request.path}`),
                'server.address': origin.hostname,
                'server.port': Number(origin.port) || (origin.protocol === 'https:' ? 443 : 80),
            });
            if (!span) return;
            if (!hasHeader(request.headers, 'traceparent')) request.addHeader('traceparent', header(span));
            spans.set(request, span);
        });
        diagnostics.subscribe('undici:request:headers', ({ request, response }) => {
            const span = spans.get(request);
            if (span) span.statusError = statusError(span, response.statusCode);
        });
        diagnostics.subscribe('undici:request:trailers', ({ request }) => {
            const span = spans.get(request);
            if (span) finish(span, span.statusError);
        });
        diagnostics.subscribe('undici:request:error', ({ request, error }) => {
            const span = spans.get(request);
            if (span) span.attributes['error.type'] = error?.code ?? error?.name ?? 'Error';
            finish(span, error?.code ?? error?.message ?? 'Error');
        });
    }

    if (kinds.has('dns')) {
        const dns = require('node:dns');
        const record = (hostname) =>
            start('dns.lookup', { 'dns.question.name': typeof hostname === 'string' ? hostname : '' });
        const callbackLookup = dns.lookup;
        const lookup = function (hostname, ...rest) {
            const callbackIndex = rest.findIndex((arg) => typeof arg === 'function');
            const span = callbackIndex === -1 ? undefined : record(hostname);
            if (span) {
                const callback = rest[callbackIndex];
                rest[callbackIndex] = function (error, ...results) {
                    if (error) span.attributes['error.type'] = error.code ?? error.name;
                    finish(span, error ? error.code ?? error.message : undefined);
                    return callback.call(this, error, ...results);
                };
            }
            return callbackLookup.call(this, hostname, ...rest);
        };
        // Preserve util.promisify and other symbol metadata from the original function.
        for (const symbol of Object.getOwnPropertySymbols(callbackLookup)) {
            Object.defineProperty(lookup, symbol, Object.getOwnPropertyDescriptor(callbackLookup, symbol));
        }
        dns.lookup = lookup;

        const promiseLookup = dns.promises.lookup;
        dns.promises.lookup = async function (hostname, ...rest) {
            const span = record(hostname);
            try {
                const result = await promiseLookup.call(this, hostname, ...rest);
                finish(span);
                return result;
            } catch (error) {
                if (span) span.attributes['error.type'] = error?.code ?? error?.name;
                finish(span, error?.code ?? error?.message ?? 'Error');
                throw error;
            }
        };
        // Named ESM imports of node:dns are bindings that only refresh on sync.
        require('node:module').syncBuiltinESMExports();
    }
}

module.exports = { install, newSpanId, newTraceId, nowNs, sanitizeUrl, traceparent };
