// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const { measureRound, readTargets } = require('../probe/src/measure.cjs');

const root = path.resolve(__dirname, '..');
const bootId = 'c65a79d2-8b10-4d4a-9e85-2f4d45a78524';
const roundId = '64f5a402-04db-47d6-9aa3-26a759530c8a';
const targets = [
    { variant: 'customer-exe', url: 'https://treatment.example/api/hello', key: 'test-key' },
    { variant: 'baseline', url: 'https://baseline.example/api/hello', key: 'test-key' },
    { variant: 'node-otel', url: 'https://node-otel.example/api/hello', key: 'test-key' },
];

function response(target, firstInvocation = true, id = bootId) {
    return {
        elapsedMs: 42,
        httpStatus: 200,
        body: {
            message: 'Hello World',
            benchmark: {
                prefix: 'otel-coldstart',
                variant: target.variant,
                roundId,
                bootId: id,
                appName: target.variant,
                instanceId: 'test-instance',
                firstInvocation,
                invocationCount: firstInvocation ? 1 : 2,
                workerUptimeMs: 100,
                entryLoadMs: 2,
                otelEnabled: target.variant !== 'baseline',
            },
        },
    };
}

function logger() {
    const records = [];
    return {
        records,
        log: (message) => records.push(JSON.parse(message.slice('otel-coldstart '.length))),
        error: (message) => records.push(JSON.parse(message.slice('otel-coldstart '.length))),
    };
}

function loadSample(variant, enabled = true) {
    let registration;
    const imports = [];
    vm.runInNewContext(fs.readFileSync(path.join(root, variant, 'src', 'index.cjs'), 'utf8'), {
        performance,
        process: { env: {}, uptime: () => 1 },
        require(name) {
            imports.push(name);
            if (name === '@azure/functions') return { app: { http: (_, options) => (registration = options), hook: { appTerminate() {} } } };
            if (name === '@azure/functions-opentelemetry-native') return { enable: () => ({ enabled }) };
            if (name === './telemetry.cjs') return {
                sdk: { shutdown: async () => {} },
                context: { active: () => ({}) },
                propagation: { extract: () => ({}) },
                trace: { getTracer: () => ({ startActiveSpan: (_name, _options, _parent, callback) => callback({ end() {} }) }) },
                logs: { getLogger: () => ({ emit() {} }) },
                SpanKind: { SERVER: 1 },
                SeverityNumber: { INFO: 9 },
                logEnabled: true,
            };
            return require(name);
        },
    });
    return { registration, imports };
}

test('all HTTP variants report worker-first once and retain the same boot ID', () => {
    for (const variant of ['with-customer-exe', 'without-otel', 'with-node-otel']) {
        const { registration, imports } = loadSample(variant);
        const request = { headers: new Map([['x-benchmark-round', roundId]]) };
        const context = logger();
        const first = registration.handler(request, context);
        const second = registration.handler(request, context);
        assert.equal(registration.authLevel, 'function');
        assert.equal(first.jsonBody.message, 'Hello World');
        assert.equal(first.jsonBody.benchmark.firstInvocation, true);
        assert.equal(second.jsonBody.benchmark.firstInvocation, false);
        assert.equal(second.jsonBody.benchmark.invocationCount, 2);
        assert.equal(first.jsonBody.benchmark.bootId, second.jsonBody.benchmark.bootId);
        assert.equal(first.jsonBody.benchmark.instanceId, require('node:os').hostname());
        assert.equal(first.jsonBody.benchmark.roundId, roundId);
        assert.equal(first.jsonBody.benchmark.otelEnabled, variant !== 'without-otel');
        assert.equal(imports.includes('@azure/functions-opentelemetry-native'), variant === 'with-customer-exe');
    }
});

test('treatment refuses to run if enable silently disables telemetry', () => {
    assert.throws(() => loadSample('with-customer-exe', false), /requires a working OTel package/);
});

test('probe distinguishes worker-first requests and verified same-worker warm controls', async () => {
    const calls = new Map();
    const context = logger();
    const results = await measureRound(
        targets,
        context,
        false,
        async (target) => {
            const count = (calls.get(target.variant) ?? 0) + 1;
            calls.set(target.variant, count);
            return response(target, count === 1);
        },
        roundId
    );
    assert.equal(results.length, 6);
    for (const target of targets) {
        const pair = results.filter((result) => result.variant === target.variant);
        assert.equal(pair[0].classification, 'worker-first');
        assert.equal(pair[1].classification, 'warm-control');
        assert.equal(pair[0].elapsedMs, 42);
    }
    assert.equal(context.records.length, 6);
});

test('a different worker during the warm phase is never labeled a warm control', async () => {
    let calls = 0;
    const results = await measureRound(
        [targets[1]],
        logger(),
        true,
        async (target) => response(target, false, ++calls === 1 ? bootId : roundId),
        roundId
    );
    assert.equal(results[0].classification, 'existing-worker');
    assert.equal(results[1].classification, 'existing-worker');
    assert.equal(results[0].isPastDue, true);
});

test('probe logs a failed target without retries and still measures the other target', async () => {
    let failedCalls = 0;
    const context = logger();
    const results = await measureRound(
        targets,
        context,
        false,
        async (target) => {
            if (target.variant === 'customer-exe') {
                failedCalls++;
                throw Object.assign(new Error('UnexpectedHttpStatus'), { status: 503 });
            }
            return response(target, false);
        },
        roundId
    );
    assert.equal(failedCalls, 1);
    assert.equal(results.length, 5);
    assert.equal(results[0].success, false);
    assert.equal(results[0].httpStatus, 503);
    assert.equal(results[0].classification, 'error');
    assert.equal(results.filter((result) => result.success).length, 4);
});

test('a stale response or telemetry-disabled treatment is rejected rather than recorded as success', async () => {
    for (const invalid of ['roundId', 'otelEnabled', 'firstInvocation']) {
        const results = await measureRound(
            [targets[0]],
            logger(),
            false,
            async (target) => {
                const result = response(target);
                result.body.benchmark[invalid] = invalid === 'roundId' ? 'stale-round' : false;
                return result;
            },
            roundId
        );
        assert.equal(results.length, 1);
        assert.equal(results[0].success, false);
        assert.equal(results[0].error, 'InvalidBenchmarkResponse');
    }
});

test('probe configuration rejects unresolved keys and URLs carrying secrets or non-HTTPS protocols', () => {
    const env = {
        EXE_URL: targets[0].url,
        EXE_FUNCTION_KEY: 'test-key',
        BASELINE_URL: targets[1].url,
        BASELINE_FUNCTION_KEY: 'test-key',
        NODE_OTEL_URL: targets[2].url,
        NODE_OTEL_FUNCTION_KEY: 'test-key',
    };
    assert.equal(readTargets(env).length, 3);
    assert.throws(() => readTargets({ ...env, EXE_FUNCTION_KEY: '@Microsoft.KeyVault(secret)' }), /resolved function key/);
    assert.throws(() => readTargets({ ...env, NODE_OTEL_FUNCTION_KEY: undefined }), /node-otel/);
    assert.throws(() => readTargets({ ...env, NODE_OTEL_FUNCTION_KEY: '@Microsoft.KeyVault(secret)' }), /node-otel/);
    for (const url of ['http://example.test/api/hello', 'https://example.test/api/hello?code=secret']) {
        assert.throws(() => readTargets({ ...env, EXE_URL: url }), /HTTPS URL/);
    }
});

test('Node OTel sample exports a real invocation span and log with propagated trace context', () => {
    const script = `
        const fs = require('node:fs');
        const vm = require('node:vm');
        const { createRequire } = require('node:module');
        const entry = process.argv[1];
        const load = createRequire(entry);
        let handler, shutdown;
        vm.runInNewContext(fs.readFileSync(entry, 'utf8'), {
            performance, process, console,
            require(name) {
                if (name === '@azure/functions') return { app: {
                    http: (_, options) => { handler = options.handler; },
                    hook: { appTerminate: (callback) => { shutdown = callback; } },
                } };
                return load(name);
            },
        });
        const traceParent = '00-12345678901234567890123456789012-1234567890123456-00';
        const result = handler({ headers: new Map([['x-benchmark-round', 'sdk-smoke']]) }, {
            invocationId: 'sdk-smoke', traceContext: { traceParent }, log: console.log,
        });
        if (!result.jsonBody.benchmark.otelEnabled) throw new Error('SDK disabled');
        shutdown().catch((error) => { console.error(error); process.exitCode = 1; });
    `;
    const result = spawnSync(process.execPath, ['-e', script, path.join(root, 'with-node-otel', 'src', 'index.cjs')], {
        encoding: 'utf8',
        timeout: 30000,
        env: {
            ...process.env,
            OTEL_NODE_ENABLED_INSTRUMENTATIONS: 'http,dns,fetch,logs',
            OTEL_SDK_DISABLED: 'false',
            OTEL_TRACES_SAMPLER: 'always_on',
        },
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assert.match(result.stdout, /\[node-otel\] ready/);
    assert.match(result.stdout, /name: 'GET hello'/);
    assert.match(result.stdout, /traceId: '12345678901234567890123456789012'/);
    assert.match(result.stdout, /severityNumber: 9/);
    assert.match(result.stdout, /"variant":"node-otel"/);
});
