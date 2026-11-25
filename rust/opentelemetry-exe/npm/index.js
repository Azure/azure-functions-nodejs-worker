// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { install, newSpanId, newTraceId, nowNs } = require('./lib/instrumentation');

const supportedInstrumentations = ['http', 'dns', 'fetch', 'logs'];
const exeName = process.platform === 'win32' ? 'azfunc-otel.exe' : 'azfunc-otel';
const maxBufferedBytes = 4 * 1024 * 1024;
const maxPendingRecords = 10000;
const defaultStartDelayMs = 1000;
const spanKey = Symbol.for('azure-functions-opentelemetry-native.span');
const traceparentPattern = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

let enabled;

function parseInstrumentations(value) {
    const list = Array.isArray(value) ? value : String(value ?? '').split(',');
    const selected = new Set();
    for (const item of list) {
        const name = String(item).trim().toLowerCase();
        if (!name) continue;
        if (supportedInstrumentations.includes(name)) selected.add(name);
        else
            console.warn(
                `[otel-native] Ignoring unknown instrumentation '${name}'. Supported: ${supportedInstrumentations.join(
                    ', '
                )}`
            );
    }
    return selected;
}

function parseTraceparent(value) {
    const match = typeof value === 'string' ? traceparentPattern.exec(value.trim().toLowerCase()) : null;
    if (!match || /^0+$/.test(match[1]) || /^0+$/.test(match[2])) return undefined;
    return { traceId: match[1], spanId: match[2], sampled: (parseInt(match[3], 16) & 1) === 1 };
}

// Implements the standard OTEL_TRACES_SAMPLER values. The sidecar exports every span it receives.
function createSampler(name = 'parentbased_always_on', arg) {
    const ratio = Math.min(Math.max(Number(arg ?? 1), 0), 1);
    const byRatio = (traceId) => parseInt(traceId.slice(16, 30), 16) / 2 ** 56 < ratio;
    const root = {
        always_on: () => true,
        always_off: () => false,
        traceidratio: byRatio,
        parentbased_always_on: () => true,
        parentbased_always_off: () => false,
        parentbased_traceidratio: byRatio,
    };
    const normalized = String(name).trim().toLowerCase();
    if (!root[normalized]) {
        console.warn(`[otel-native] Unsupported OTEL_TRACES_SAMPLER '${name}'; using parentbased_always_on`);
        return createSampler();
    }
    const parentBased = normalized.startsWith('parentbased_');
    return (parent, traceId) => (parentBased && parent ? parent.sampled : root[normalized](traceId));
}

function resolveExe(explicit) {
    const candidates = [
        explicit,
        process.env.AZURE_FUNCTIONS_OTEL_EXE,
        path.join(__dirname, 'bin', `${process.platform}-${process.arch}`, exeName),
    ];
    return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

// Spawning a process blocks the event loop (about 25-60 ms on Windows), so the sidecar starts
// after the first invocation completes, or after a short idle delay, and records are buffered until then.
function createSidecar(exe, env, instrumentations, startDelayMs) {
    let child;
    let healthy = true;
    let dropped = 0;
    let pending = [];
    const fail = (reason) => {
        if (!healthy) return;
        healthy = false;
        pending = [];
        console.warn(`[otel-native] Telemetry sidecar stopped (${reason}); telemetry is disabled.`);
    };
    const write = (record) => {
        if (child.stdin.writableLength > maxBufferedBytes) {
            if (dropped++ % 1000 === 0) console.warn('[otel-native] Telemetry sidecar is behind; dropping records.');
            return;
        }
        child.stdin.write(`${JSON.stringify(record)}\n`);
    };
    const start = () => {
        if (child || !healthy) return;
        const started = performance.now();
        try {
            child = spawn(exe, [], { stdio: ['pipe', 'inherit', 'inherit'], env, windowsHide: true });
        } catch (error) {
            return fail(error.message);
        }
        child.on('error', (error) => fail(error.message));
        child.on('exit', (code, signal) => fail(signal ?? `exit code ${code}`));
        child.stdin.on('error', (error) => fail(error.message));
        // The sidecar must never keep the worker process alive.
        child.unref();
        child.stdin.unref?.();
        console.log(
            `[otel-native] sidecar started pid=${child.pid} instrumentations=${instrumentations.join(',') || 'none'} ` +
                `spawn=${(performance.now() - started).toFixed(1)}ms buffered=${pending.length}`
        );
        for (const record of pending) write(record);
        pending = [];
    };
    const idleTimer = setTimeout(start, startDelayMs);
    idleTimer.unref();
    return {
        startSoon() {
            if (!child) setImmediate(start);
        },
        send(record) {
            if (!healthy) return;
            if (child) return write(record);
            if (pending.length < maxPendingRecords) pending.push(record);
            else dropped++;
        },
        close(timeoutMs) {
            clearTimeout(idleTimer);
            start();
            return new Promise((resolve) => {
                if (!child || child.exitCode !== null || child.signalCode !== null) return resolve();
                const timer = setTimeout(resolve, timeoutMs);
                child.once('exit', () => {
                    clearTimeout(timer);
                    resolve();
                });
                healthy = false;
                child.stdin.end();
            });
        },
    };
}

/**
 * Enables OpenTelemetry for an Azure Functions Node.js app (programming model v4).
 * Invocation spans are always on; client instrumentations and logs are opt-in.
 * The OpenTelemetry SDK and exporters run in the bundled `azfunc-otel` sidecar,
 * so the app takes no OpenTelemetry npm dependencies. Call once, before registering functions.
 *
 * @param {object} [options]
 * @param {string[]} [options.instrumentations] Any of `http`, `dns`, `fetch` and `logs`.
 *   Defaults to the `OTEL_NODE_ENABLED_INSTRUMENTATIONS` app setting (comma-separated).
 * @param {string} [options.serviceName] Overrides `OTEL_SERVICE_NAME`.
 * @param {'auto'|'otlp'|'azuremonitor'|'console'|'none'} [options.exporter] Overrides `AZURE_FUNCTIONS_OTEL_EXPORTER`.
 * @param {string} [options.exePath] Overrides the sidecar location (`AZURE_FUNCTIONS_OTEL_EXE`).
 * @param {number} [options.startDelayMs] Idle delay before the sidecar starts if no invocation completes first
 *   (`AZURE_FUNCTIONS_OTEL_START_DELAY_MS`, default 1000).
 * @returns {{ enabled: boolean, instrumentations: string[], flush(): void, shutdown(timeoutMs?: number): Promise<void> }}
 * @example
 * const otel = require('@azure/functions-opentelemetry-native');
 * otel.enable({ instrumentations: ['http', 'dns', 'fetch'] });
 */
function enable(options = {}) {
    if (enabled) return enabled;
    const disabled = { enabled: false, instrumentations: [], flush() {}, shutdown: async () => {} };
    const exe = resolveExe(options.exePath);
    if (!exe) {
        console.warn(
            `[otel-native] ${exeName} was not found for ${process.platform}-${process.arch}; telemetry is disabled.`
        );
        return (enabled = disabled);
    }
    const { app } = require('@azure/functions');
    const instrumentations = parseInstrumentations(
        options.instrumentations ?? process.env.OTEL_NODE_ENABLED_INSTRUMENTATIONS
    );
    const sampler = createSampler(process.env.OTEL_TRACES_SAMPLER, process.env.OTEL_TRACES_SAMPLER_ARG);
    const env = { ...process.env };
    if (options.serviceName) env.OTEL_SERVICE_NAME = options.serviceName;
    if (options.exporter) env.AZURE_FUNCTIONS_OTEL_EXPORTER = options.exporter;
    const startDelayMs = Number(
        options.startDelayMs ?? process.env.AZURE_FUNCTIONS_OTEL_START_DELAY_MS ?? defaultStartDelayMs
    );
    const sidecar = createSidecar(exe, env, [...instrumentations], startDelayMs);
    const storage = new AsyncLocalStorage();
    const spansByContext = new WeakMap();

    install(instrumentations, () => storage.getStore(), sidecar.send);

    app.hook.preInvocation((context) => {
        const invocation = context.invocationContext;
        const parent = parseTraceparent(invocation.traceContext?.traceParent);
        const traceId = parent?.traceId ?? newTraceId();
        const trigger = invocation.options?.trigger;
        const isHttp = trigger?.type === 'httpTrigger';
        const request = isHttp ? context.inputs[0] : undefined;
        const route = trigger?.route ?? invocation.functionName;
        const span = {
            traceId,
            spanId: newSpanId(),
            parentSpanId: parent?.spanId,
            traceState: invocation.traceContext?.traceState || undefined,
            sampled: sampler(parent, traceId),
            name: isHttp ? `${request?.method ?? 'HTTP'} ${route}` : invocation.functionName,
            startNs: nowNs(),
            isHttp,
            attributes: {
                'faas.name': invocation.functionName,
                'faas.invocation_id': invocation.invocationId,
                'faas.trigger': isHttp ? 'http' : 'other',
            },
        };
        if (isHttp) {
            span.attributes['http.request.method'] = request?.method;
            span.attributes['http.route'] = route;
            try {
                span.attributes['url.path'] = new URL(request.url).pathname;
            } catch {
                // Leave url.path unset for unparseable URLs.
            }
        }
        context.hookData[spanKey] = span;
        spansByContext.set(invocation, span);
        const handler = context.functionHandler;
        context.functionHandler = function (...args) {
            return storage.run(span, () => handler.apply(this, args));
        };
    });

    app.hook.postInvocation((context) => {
        sidecar.startSoon();
        const span = context.hookData[spanKey];
        if (!span?.sampled) return;
        let error = context.error ? String(context.error?.message ?? context.error) : undefined;
        if (span.isHttp) {
            const status = context.error ? 500 : Number(context.result?.status ?? 200);
            span.attributes['http.response.status_code'] = status;
            if (status >= 500 && !error) error = String(status);
        }
        if (error) span.attributes['error.type'] = context.error?.name ?? error;
        sidecar.send({
            t: 'span',
            kind: 'server',
            name: span.name,
            traceId: span.traceId,
            spanId: span.spanId,
            parentSpanId: span.parentSpanId,
            traceState: span.traceState,
            startNs: span.startNs,
            endNs: nowNs(),
            error: error?.slice(0, 256),
            attributes: span.attributes,
        });
    });

    if (instrumentations.has('logs') && typeof app.hook.log === 'function') {
        app.hook.log((context) => {
            if (context.category !== 'user') return;
            const span = context.invocationContext ? spansByContext.get(context.invocationContext) : undefined;
            if (span && !span.sampled) return;
            sidecar.send({
                t: 'log',
                timeNs: nowNs(),
                severity: context.level,
                body: context.message,
                traceId: span?.traceId,
                spanId: span?.spanId,
                attributes: span ? { 'faas.name': span.attributes['faas.name'] } : {},
            });
        });
    }

    const api = {
        enabled: true,
        instrumentations: [...instrumentations],
        flush: () => sidecar.send({ t: 'flush' }),
        shutdown: (timeoutMs = 5000) => sidecar.close(timeoutMs),
    };
    app.hook.appTerminate(() => api.shutdown());
    return (enabled = api);
}

module.exports = { enable };
