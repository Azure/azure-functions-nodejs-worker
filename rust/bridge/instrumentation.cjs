// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

'use strict';

// Lightweight client hooks for the worker-native OpenTelemetry pipeline.
// Node.js only observes calls and reports their timing; Rust builds and exports the spans.
// This module is required only when OTEL_WORKER_ENABLE selects at least one instrumentation.

const { randomBytes } = require('node:crypto');
const diagnostics = require('node:diagnostics_channel');
const { context, trace, isSpanContextValid } = require('@opentelemetry/api');

const maxUrlLength = 1024;
const redactedQueryKeys = new Set(['sig', 'signature', 'awsaccesskeyid', 'x-goog-signature']);
const epochNs = () => BigInt(Math.round((performance.timeOrigin + performance.now()) * 1e6));

function activeParent() {
    const parent = trace.getSpanContext(context.active());
    return parent && isSpanContextValid(parent) ? parent : undefined;
}

function newSpanId() {
    let id;
    do {
        id = randomBytes(8).toString('hex');
    } while (id === '0000000000000000');
    return id;
}

function traceparent(parent, spanId) {
    const flags = (parent.traceFlags & 0xff).toString(16).padStart(2, '0');
    return `00-${parent.traceId}-${spanId}-${flags}`;
}

function sanitizeUrl(value) {
    try {
        const url = new URL(value);
        url.username = '';
        url.password = '';
        for (const key of [...url.searchParams.keys()]) {
            if (redactedQueryKeys.has(key.toLowerCase())) url.searchParams.set(key, 'REDACTED');
        }
        value = url.toString();
    } catch {
        // Report the raw value when it is not a parseable absolute URL.
    }
    return value.length > maxUrlLength ? value.slice(0, maxUrlLength) : value;
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

function install(kinds, report) {
    const start = (kind, name, attributes) => {
        const parent = activeParent();
        if (!parent) return undefined;
        return {
            kind,
            name,
            parent,
            spanId: newSpanId(),
            startNs: epochNs(),
            attributes,
            ended: false,
        };
    };
    const finish = (span, error) => {
        if (!span || span.ended) return;
        span.ended = true;
        // Unsampled traces still propagate traceparent but skip the IPC report.
        if ((span.parent.traceFlags & 0x01) === 0) return;
        const event = {
            event: 'clientSpan',
            kind: span.kind,
            name: span.name,
            // The traceparent identifies the parent; Rust assigns spanId (already injected) to the child.
            traceparent: traceparent(span.parent, span.parent.spanId),
            spanId: span.spanId,
            startNs: span.startNs.toString(),
            endNs: epochNs().toString(),
        };
        const tracestate = span.parent.traceState?.serialize();
        if (tracestate) event.tracestate = tracestate;
        for (const [key, value] of Object.entries(span.attributes)) {
            if (value === undefined || value === null || value === '') continue;
            if (Number.isSafeInteger(value)) event[`i:${key}`] = String(value);
            else event[`a:${key}`] = String(value);
        }
        if (error) {
            event.error = String(error).slice(0, 256);
            if (!span.attributes['error.type']) event['a:error.type'] = event.error;
        }
        try {
            report(event);
        } catch (reportError) {
            console.error('Failed to report worker client span:', reportError?.message ?? reportError);
        }
    };
    const statusError = (span, status) => {
        span.attributes['http.response.status_code'] = status;
        if (status >= 400) {
            span.attributes['error.type'] = String(status);
            return String(status);
        }
        return undefined;
    };

    if (kinds.has('http')) {
        const spans = new WeakMap();
        diagnostics.subscribe('http.client.request.created', ({ request }) => {
            const host = String(request.getHeader('host') ?? request.host ?? '');
            const protocol = request.protocol ?? 'http:';
            const [address, port] = host.startsWith('[')
                ? [host.slice(1, host.indexOf(']')), host.slice(host.indexOf(']') + 2)]
                : host.split(':');
            const inject = !request.getHeader('traceparent');
            const span = start('http', request.method, {
                'http.request.method': request.method,
                'url.full': sanitizeUrl(`${protocol}//${host}${request.path}`),
                'server.address': address || request.host,
                'server.port': Number(port) || (protocol === 'https:' ? 443 : 80),
            });
            if (!span) return;
            if (inject) request.setHeader('traceparent', traceparent(span.parent, span.spanId));
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
            const span = start('fetch', request.method, {
                'http.request.method': request.method,
                'url.full': sanitizeUrl(`${origin.origin}${request.path}`),
                'server.address': origin.hostname,
                'server.port': Number(origin.port) || (origin.protocol === 'https:' ? 443 : 80),
            });
            if (!span) return;
            if (!hasHeader(request.headers, 'traceparent')) {
                request.addHeader('traceparent', traceparent(span.parent, span.spanId));
            }
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
            start('dns', 'dns.lookup', { 'dns.question.name': typeof hostname === 'string' ? hostname : '' });
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

module.exports = { install };
