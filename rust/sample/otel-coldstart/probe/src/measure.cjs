// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

'use strict';

const https = require('node:https');
const { randomUUID } = require('node:crypto');

function readTargets(env) {
    return [
        { variant: 'customer-exe', url: env.EXE_URL, key: env.EXE_FUNCTION_KEY },
        { variant: 'baseline', url: env.BASELINE_URL, key: env.BASELINE_FUNCTION_KEY },
        { variant: 'node-otel', url: env.NODE_OTEL_URL, key: env.NODE_OTEL_FUNCTION_KEY },
    ].map((target) => {
        if (!target.url || !target.key || target.key.startsWith('@Microsoft.KeyVault(')) {
            throw new Error(`otel-coldstart: URL or resolved function key missing for ${target.variant}.`);
        }
        const url = new URL(target.url);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
            throw new Error(`otel-coldstart: ${target.variant} requires an HTTPS URL without credentials or query.`);
        }
        return target;
    });
}

function requestJson(target, roundId, timeoutMs) {
    return new Promise((resolve, reject) => {
        const started = performance.now();
        let settled = false;
        const complete = (error, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (error) reject(error);
            else resolve(value);
        };
        const request = https.get(
            target.url,
            {
                agent: false,
                headers: {
                    'x-functions-key': target.key,
                    'x-benchmark-round': roundId,
                    'cache-control': 'no-cache',
                },
            },
            (response) => {
                let body = '';
                response.setEncoding('utf8');
                response.on('data', (chunk) => {
                    body += chunk;
                    if (body.length > 65536) request.destroy(new Error('ResponseTooLarge'));
                });
                response.on('error', (error) => complete(error));
                response.on('end', () => {
                    const elapsedMs = performance.now() - started;
                    if (response.statusCode !== 200) {
                        return complete(Object.assign(new Error('UnexpectedHttpStatus'), { status: response.statusCode }));
                    }
                    try {
                        complete(null, { elapsedMs, httpStatus: response.statusCode, body: JSON.parse(body) });
                    } catch {
                        complete(new Error('InvalidJsonResponse'));
                    }
                });
            }
        );
        const timer = setTimeout(() => request.destroy(new Error('ProbeTimeout')), timeoutMs);
        request.on('error', (error) => complete(error));
    });
}

function validateResponse(body, target, roundId) {
    const data = body?.benchmark;
    if (
        body?.message !== 'Hello World' ||
        data?.prefix !== 'otel-coldstart' ||
        data?.variant !== target.variant ||
        data?.roundId !== roundId ||
        typeof data?.bootId !== 'string' ||
        !/^[0-9a-f-]{36}$/i.test(data.bootId) ||
        typeof data?.firstInvocation !== 'boolean' ||
        !Number.isInteger(data?.invocationCount) ||
        data.invocationCount < 1 ||
        data.firstInvocation !== (data.invocationCount === 1) ||
        !Number.isFinite(data?.workerUptimeMs) ||
        data.workerUptimeMs < 0 ||
        !Number.isFinite(data?.entryLoadMs) ||
        data.entryLoadMs < 0 ||
        typeof data?.appName !== 'string' ||
        typeof data?.instanceId !== 'string' ||
        data?.otelEnabled !== (target.variant !== 'baseline')
    ) {
        throw new Error('InvalidBenchmarkResponse');
    }
    return data;
}

async function measureRound(targets, context, isPastDue, send = requestJson, roundId = randomUUID()) {
    const measurements = await Promise.all(
        targets.map(async (target) => {
            const results = [];
            let idleResult;
            for (const phase of ['idle', 'warm']) {
                const started = performance.now();
                try {
                    const response = await send(target, roundId, 120000);
                    const data = validateResponse(response.body, target, roundId);
                    const classification = data.firstInvocation
                        ? 'worker-first'
                        : phase === 'warm' && idleResult?.bootId === data.bootId
                          ? 'warm-control'
                          : 'existing-worker';
                    const result = {
                        ...data,
                        event: 'measurement',
                        phase,
                        classification,
                        measuredAt: new Date().toISOString(),
                        elapsedMs: response.elapsedMs,
                        httpStatus: response.httpStatus,
                        isPastDue,
                        success: true,
                    };
                    context.log(`otel-coldstart ${JSON.stringify(result)}`);
                    results.push(result);
                    if (phase === 'idle') idleResult = data;
                } catch (error) {
                    const result = {
                        prefix: 'otel-coldstart',
                        event: 'measurement',
                        variant: target.variant,
                        roundId,
                        phase,
                        classification: 'error',
                        measuredAt: new Date().toISOString(),
                        elapsedMs: performance.now() - started,
                        httpStatus: error.status ?? null,
                        error: error.code ?? error.message,
                        isPastDue,
                        success: false,
                    };
                    context.error(`otel-coldstart ${JSON.stringify(result)}`);
                    results.push(result);
                    break;
                }
            }
            return results;
        })
    );
    return measurements.flat();
}

module.exports = { measureRound, readTargets, requestJson };
