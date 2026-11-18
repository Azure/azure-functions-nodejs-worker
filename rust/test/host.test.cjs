// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const http = require('node:http');
const { createRequire } = require('node:module');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const engine = path.resolve(root, '..');
const engineRequire = createRequire(path.join(engine, 'package.json'));
const grpc = engineRequire('@grpc/grpc-js');
const loader = engineRequire('@grpc/proto-loader');
const descriptor = engineRequire('./dist/azure-functions-language-worker-protobuf/src/rpc.js');
const definition = loader.fromJSON(descriptor, { defaults: true, oneofs: true, longs: String });
const service = grpc.loadPackageDefinition(definition).AzureFunctionsRpcMessages.FunctionRpc.service;
const traceId = '12345678901234567890123456789012';
const traceParent = `00-${traceId}-1234567890123456-01`;
const binary = path.join(
    root,
    'target',
    'debug',
    process.platform === 'win32' ? 'azure-functions-nodejs-worker-rust.exe' : 'azure-functions-nodejs-worker-rust'
);

async function host(
    t,
    {
        enabled = true,
        exporter = 'console',
        env = {},
        maxLength = 16 * 1024 * 1024,
        instrumentations = { http: true, functions: true, logs: true },
    } = {}
) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rust-grpc-worker-'));
    const configPath = path.join(directory, 'runtime.json');
    await fs.writeFile(
        configPath,
        JSON.stringify({
            engine_directory: engine,
            node_executable: process.execPath,
            node_arguments: [],
            telemetry: {
                enabled,
                service_name: 'rust-parity-test',
                context_propagation: true,
                instrumentations,
                exporter,
            },
        })
    );
    const messages = [];
    const waiters = new Set();
    let call;
    let child;
    let closed;
    let stdout = '';
    let stderr = '';
    const server = new grpc.Server({
        'grpc.max_receive_message_length': maxLength,
        // This engine's grpc-js version counts the five-byte gRPC frame header on send.
        'grpc.max_send_message_length': maxLength + 5,
    });
    server.addService(service, {
        eventStream(stream) {
            call = stream;
            stream.on('error', (error) => {
                if (error.code !== grpc.status.CANCELLED) {
                    for (const waiter of waiters) waiter.reject(error);
                }
            });
            stream.on('data', (message) => {
                messages.push(message);
                for (const waiter of waiters) if (waiter.predicate(message)) waiter.resolve(message);
            });
        },
    });
    const port = await new Promise((resolve, reject) =>
        server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error, port) =>
            error ? reject(error) : resolve(port)
        )
    );
    server.start();
    child = spawn(
        binary,
        [
            '--host',
            '127.0.0.1',
            '--port',
            String(port),
            '--workerId',
            'rust-test-worker',
            '--requestId',
            'start',
            '--grpcMaxMessageLength',
            String(maxLength),
            '--functions-uri',
            `http://127.0.0.1:${port}`,
            '--functions-worker-id',
            'rust-test-worker',
            '--functions-request-id',
            'start',
            '--functions-grpc-max-message-length',
            String(maxLength),
            '--rust-config',
            configPath,
        ],
        { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    closed = once(child, 'close');
    child.stdout.on('data', (data) => {
        stdout += data;
    });
    child.stderr.on('data', (data) => {
        stderr += data;
    });
    child.on('error', (error) => {
        for (const waiter of waiters) waiter.reject(error);
    });
    child.on('close', (code) => {
        for (const waiter of waiters) waiter.reject(new Error(`Worker exited ${code}: ${stderr}`));
    });
    t.after(async () => {
        if (child.exitCode === null) {
            call?.write({ workerTerminate: { gracePeriod: { seconds: '2' } } });
            const timer = setTimeout(() => child.kill(), 5000);
            await closed;
            clearTimeout(timer);
        }
        server.forceShutdown();
        await fs.rm(configPath);
        await fs.rmdir(directory);
    });
    function waitFor(predicate) {
        const existing = messages.find(predicate);
        if (existing) return Promise.resolve(existing);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                waiters.delete(waiter);
                reject(new Error(`Host response timed out: ${stderr}`));
            }, 15000);
            const waiter = {
                predicate,
                resolve(value) {
                    clearTimeout(timer);
                    waiters.delete(waiter);
                    resolve(value);
                },
                reject(error) {
                    clearTimeout(timer);
                    waiters.delete(waiter);
                    reject(error);
                },
            };
            waiters.add(waiter);
        });
    }
    async function request(name, value, responseName) {
        const requestId = randomUUID();
        call.write({ requestId, [name]: value });
        return (await waitFor((message) => message.requestId === requestId && message[responseName]))[responseName];
    }
    await waitFor((message) => message.startStream?.workerId === 'rust-test-worker');
    return {
        request,
        waitFor,
        messages,
        stdout: () => stdout,
        stderr: () => stderr,
        child,
        closed,
        terminate: () => call.write({ workerTerminate: { gracePeriod: { seconds: '2' } } }),
    };
}

async function initialize(worker, app = 'v4') {
    const directory = path.join(__dirname, 'apps', app);
    const init = await worker.request(
        'workerInitRequest',
        { hostVersion: '4.1044.0', functionAppDirectory: directory },
        'workerInitResponse'
    );
    assert.equal(init.result.status, 1, JSON.stringify(init));
    const metadata = await worker.request(
        'functionsMetadataRequest',
        { functionAppDirectory: directory },
        'functionMetadataResponse'
    );
    assert.equal(metadata.result.status, 1, JSON.stringify(metadata));
    return { init, metadata, directory };
}

function invocation(
    metadata,
    name,
    { query = {}, body, method = 'GET', trace = traceParent, invocationId = randomUUID() } = {}
) {
    const fn = metadata.functionMetadataResults.find((fn) => fn.name === name);
    assert.ok(fn, `Missing function ${name}`);
    const trigger = fn.rawBindings.map(JSON.parse).find((binding) => binding.type.toLowerCase() === 'httptrigger');
    return {
        invocationId,
        functionId: fn.functionId,
        traceContext: { traceParent: trace, traceState: 'vendor=value' },
        inputData: [
            {
                name: trigger.name,
                data: {
                    http: {
                        method,
                        url: 'http://localhost/api/users',
                        query,
                        body: body === undefined ? undefined : { bytes: Buffer.from(body) },
                    },
                },
            },
        ],
    };
}

function jsonResponse(response) {
    assert.equal(response.result.status, 1, JSON.stringify(response));
    const body = response.returnValue.http.body;
    return JSON.parse(body.string || Buffer.from(body.bytes).toString());
}

test('real gRPC lifecycle, indexing, CJS hooks, HTTP, trace context, logs, status and termination', async (t) => {
    const worker = await host(t);
    const { init, metadata } = await initialize(worker);
    assert.equal(init.capabilities.WorkerOpenTelemetryEnabled, 'true');
    assert.equal(init.capabilities.TypedDataCollection, 'true');
    assert.equal(init.workerMetadata.customProperties.executionEngine, 'nodejs');
    assert.equal(metadata.useDefaultMetadataIndexing, false);
    assert.match(worker.stderr(), /fixture:started/);
    const response = await worker.request(
        'invocationRequest',
        invocation(metadata, 'hello', { query: { name: 'Rust' } }),
        'invocationResponse'
    );
    const body = jsonResponse(response);
    assert.equal(body.name, 'Rust');
    assert.equal(response.returnValue.http.headers['x-hook'], 'true');
    assert.equal(body.active.traceId, traceId);
    assert.equal(body.traceContext.traceParent.split('-')[2], body.active.spanId);
    assert.notEqual(body.active.spanId, '1234567890123456');
    await worker.waitFor((message) => message.rpcLog?.message === 'hook:fixture:hello');
    const status = await worker.request('workerStatusRequest', {}, 'workerStatusResponse');
    assert.deepEqual(status, {});
    await worker
        .request(
            'invocationRequest',
            invocation(metadata, 'hello', { method: 'POST', body: 'payload' }),
            'invocationResponse'
        )
        .then((r) => {
            assert.equal(jsonResponse(r).body, 'payload');
        });
    assert.match(worker.stdout(), /CategoryName/);
    assert.match(worker.stdout(), new RegExp(traceId));
});

test('concurrent invocations preserve distinct async trace contexts and response correlation', async (t) => {
    const worker = await host(t);
    const { metadata } = await initialize(worker);
    const traces = Array.from({ length: 10 }, (_, n) => `${n + 1}`.padStart(32, '0'));
    const values = await Promise.all(
        traces.map((id, n) =>
            worker.request(
                'invocationRequest',
                invocation(metadata, 'hello', {
                    query: { name: String(n), delay: String(20 - n) },
                    trace: `00-${id}-1234567890123456-01`,
                }),
                'invocationResponse'
            )
        )
    );
    values.forEach((value, n) => {
        const body = jsonResponse(value);
        assert.equal(body.name, String(n));
        assert.equal(body.active.traceId, traces[n]);
    });
});

test('handler errors and binary bodies retain the current worker wire contract', async (t) => {
    const worker = await host(t);
    const { metadata } = await initialize(worker);
    const error = await worker.request('invocationRequest', invocation(metadata, 'failure'), 'invocationResponse');
    assert.equal(error.result.status, 0);
    assert.match(error.result.exception.message, /fixture:error/);
    const binary = await worker.request('invocationRequest', invocation(metadata, 'binary'), 'invocationResponse');
    assert.equal(binary.result.status, 1);
    assert.deepEqual(Buffer.from(binary.returnValue.http.body.bytes), Buffer.from([0, 255, 128, 1]));
});

test('a request exactly at the host message limit still permits worker-added trace context', async (t) => {
    const limit = 8192;
    const worker = await host(t, { maxLength: limit });
    const { metadata } = await initialize(worker);
    const request = invocation(metadata, 'binary', { method: 'POST', body: 'x' });
    delete request.traceContext;
    const wireSize = () =>
        descriptor.AzureFunctionsRpcMessages.StreamingMessage.encode({
            requestId: 'x'.repeat(36),
            invocationRequest: request,
        }).finish().length;
    let payloadSize = 7000;
    for (let attempt = 0; attempt < 5; attempt++) {
        request.inputData[0].data.http.body.bytes = Buffer.alloc(payloadSize);
        const size = wireSize();
        if (size === limit) break;
        payloadSize += limit - size;
    }
    assert.equal(wireSize(), limit);
    const response = await worker.request('invocationRequest', request, 'invocationResponse');
    assert.equal(response.result.status, 1, JSON.stringify(response));
    assert.deepEqual(Buffer.from(response.returnValue.http.body.bytes), Buffer.from([0, 255, 128, 1]));
});

test('non-HTTP bindings, extra inputs/outputs, retries and typed collections pass through unchanged', async (t) => {
    const worker = await host(t);
    const { metadata } = await initialize(worker);
    const fn = metadata.functionMetadataResults.find((fn) => fn.name === 'bindings');
    assert.equal(fn.retryOptions.maxRetryCount, 3);
    const bindings = fn.rawBindings.map(JSON.parse);
    const trigger = bindings.find((binding) => binding.type === 'queueTrigger');
    const extra = bindings.find((binding) => binding.type === 'blob');
    const response = await worker.request(
        'invocationRequest',
        {
            invocationId: randomUUID(),
            functionId: fn.functionId,
            traceContext: { traceParent },
            retryContext: { retryCount: 1, maxRetryCount: 3 },
            inputData: [
                { name: trigger.name, data: { collectionString: { string: ['a', 'b'] } } },
                { name: extra.name, data: { string: 'blob-value' } },
            ],
        },
        'invocationResponse'
    );
    assert.equal(response.result.status, 1, JSON.stringify(response));
    const result = JSON.parse(response.returnValue.json);
    assert.deepEqual(result.event, ['a', 'b']);
    assert.equal(result.extra, 'blob-value');
    assert.equal(result.retry.retryCount, 1);
    assert.deepEqual(Buffer.from(response.outputData[0].data.bytes), Buffer.from([0, 255, 128]));
});

test('ESM entrypoints receive Node.js OpenTelemetry API context without app instrumentation setup', async (t) => {
    const worker = await host(t);
    const { metadata } = await initialize(worker, 'esm');
    const response = await worker.request('invocationRequest', invocation(metadata, 'esm'), 'invocationResponse');
    assert.deepEqual(jsonResponse(response), { traceId, esm: true });
});

test('legacy v3 function loading and invocation remain available', async (t) => {
    const worker = await host(t);
    const { metadata, directory } = await initialize(worker, 'legacy');
    assert.equal(metadata.useDefaultMetadataIndexing, true);
    const loaded = await worker.request(
        'functionLoadRequest',
        {
            functionId: 'legacy-id',
            metadata: {
                name: 'legacy',
                directory,
                scriptFile: path.join(directory, 'index.cjs'),
                bindings: {
                    req: { type: 'httpTrigger', direction: 0 },
                    $return: { type: 'http', direction: 1 },
                },
            },
        },
        'functionLoadResponse'
    );
    assert.equal(loaded.result.status, 1, JSON.stringify(loaded));
    const response = await worker.request(
        'invocationRequest',
        {
            invocationId: randomUUID(),
            functionId: 'legacy-id',
            inputData: [
                {
                    name: 'req',
                    data: { http: { method: 'GET', url: 'http://localhost/api/legacy', query: { name: 'Rust' } } },
                },
            ],
        },
        'invocationResponse'
    );
    assert.equal(response.result.status, 1, JSON.stringify(response));
    assert.equal(response.returnValue.http.body.string, 'Legacy Rust');
});

test('disabled telemetry restores baseline capabilities without emitting native telemetry', async (t) => {
    const worker = await host(t, { enabled: false });
    const { init, metadata } = await initialize(worker);
    assert.ok(!init.capabilities.WorkerOpenTelemetryEnabled);
    const body = jsonResponse(
        await worker.request('invocationRequest', invocation(metadata, 'hello'), 'invocationResponse')
    );
    assert.equal(body.active, null);
    assert.equal(body.traceContext.traceParent, traceParent);
    assert.equal(worker.stdout(), '');
});

test('HTTP tracing can be disabled independently of native logs and context propagation', async (t) => {
    const worker = await host(t, { instrumentations: { http: false, functions: false, logs: true } });
    const { init, metadata } = await initialize(worker);
    assert.equal(init.capabilities.WorkerOpenTelemetryEnabled, 'true');
    const body = jsonResponse(
        await worker.request('invocationRequest', invocation(metadata, 'hello'), 'invocationResponse')
    );
    assert.equal(body.active.spanId, '1234567890123456');
    assert.equal(body.traceContext.traceParent, traceParent);
    assert.match(worker.stdout(), /CategoryName/);
    assert.doesNotMatch(worker.stdout(), /Kind\s+:/);
});

test('native log export can be disabled while native HTTP spans stay enabled', async (t) => {
    const worker = await host(t, { instrumentations: { http: true, functions: false, logs: false } });
    const { init, metadata } = await initialize(worker);
    assert.ok(!init.capabilities.WorkerOpenTelemetryEnabled);
    const body = jsonResponse(
        await worker.request('invocationRequest', invocation(metadata, 'hello'), 'invocationResponse')
    );
    assert.notEqual(body.active.spanId, '1234567890123456');
    assert.match(worker.stdout(), /Kind\s+: Server/);
    assert.doesNotMatch(worker.stdout(), /Log #/);
});

test('unknown instrumentation configuration fails explicitly before worker startup', async (t) => {
    await assert.rejects(
        host(t, {
            instrumentations: { http: true, functions: true, logs: true, database: true },
        }),
        /unknown field.*database/
    );
});

test('specialization/environment reload preserves indexing and reinstalls context hooks', async (t) => {
    const worker = await host(t);
    await worker.request('workerInitRequest', { hostVersion: '4.1044.0' }, 'workerInitResponse');
    const directory = path.join(__dirname, 'apps', 'v4');
    const reloaded = await worker.request(
        'functionEnvironmentReloadRequest',
        {
            functionAppDirectory: directory,
            environmentVariables: { ...process.env },
        },
        'functionEnvironmentReloadResponse'
    );
    assert.equal(reloaded.result.status, 1, JSON.stringify(reloaded));
    assert.equal(reloaded.capabilities.WorkerOpenTelemetryEnabled, 'true');
    const metadata = await worker.request(
        'functionsMetadataRequest',
        { functionAppDirectory: directory },
        'functionMetadataResponse'
    );
    const response = await worker.request('invocationRequest', invocation(metadata, 'hello'), 'invocationResponse');
    assert.equal(jsonResponse(response).active.traceId, traceId);
});

test('HTTP streaming keeps the existing Node.js HTTP proxy and host capability', async (t) => {
    const worker = await host(t, { env: { RUST_TEST_STREAMING: 'true' } });
    const { init, metadata } = await initialize(worker);
    assert.match(init.capabilities.HttpUri, /^http:\/\/localhost:\d+\/$/);
    const id = randomUUID();
    const proxyResponse = fetch(init.capabilities.HttpUri, {
        method: 'POST',
        headers: { 'x-ms-invocation-id': id, 'x-forwarded-host': 'localhost', 'x-forwarded-proto': 'http' },
        body: 'streamed-body',
    });
    const request = invocation(metadata, 'hello', { method: 'POST', invocationId: id });
    request.inputData[0].data.http.method = '';
    request.triggerMetadata = { Headers: { json: '{}' }, Query: { json: '{}' }, Params: { json: '{}' } };
    const response = await worker.request('invocationRequest', request, 'invocationResponse');
    assert.equal(response.result.status, 1, JSON.stringify(response));
    assert.equal((await (await proxyResponse).json()).body, 'streamed-body');
    assert.match(worker.stdout(), /Name\s+: POST users\/\{name\?\}/);
    assert.equal(worker.stdout().match(/http\.request\.method/g)?.length, 1);
});

test('native Rust OTLP exports both spans and correlated logs', async (t) => {
    const received = [];
    const collector = http.createServer((request, response) => {
        const chunks = [];
        request.on('data', (chunk) => chunks.push(chunk));
        request.on('end', () => {
            received.push({ url: request.url, body: Buffer.concat(chunks) });
            response.writeHead(200, { 'content-type': 'application/x-protobuf' }).end();
        });
    });
    collector.listen(0, '127.0.0.1');
    await once(collector, 'listening');
    t.after(() => new Promise((resolve) => collector.close(resolve)));
    const worker = await host(t, {
        exporter: 'otlp',
        env: {
            OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${collector.address().port}`,
            OTEL_BSP_SCHEDULE_DELAY: '100',
            OTEL_BLRP_SCHEDULE_DELAY: '100',
        },
    });
    const { metadata } = await initialize(worker);
    await worker.request('invocationRequest', invocation(metadata, 'hello'), 'invocationResponse');
    const correlated = (url) => received.some((r) => r.url === url && r.body.includes(Buffer.from(traceId, 'hex')));
    for (let attempt = 0; attempt < 100 && !['/v1/traces', '/v1/logs'].every(correlated); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    for (const url of ['/v1/traces', '/v1/logs']) {
        const payloads = received.filter((r) => r.url === url);
        assert.ok(
            payloads.some((r) => r.body.includes(Buffer.from(traceId, 'hex'))),
            `No correlated OTLP data at ${url}`
        );
    }
    assert.equal(worker.stdout(), '');
});

test('host termination runs appTerminate hooks and shuts down Rust cleanly', async (t) => {
    const worker = await host(t);
    await initialize(worker);
    worker.terminate();
    const [code] = await worker.closed;
    assert.equal(code, 0, worker.stderr());
    assert.match(worker.stderr(), /fixture:terminated/);
});

test('a Node.js engine crash terminates Rust with an explicit failure for host restart', async (t) => {
    const worker = await host(t);
    const { metadata } = await initialize(worker);
    await assert.rejects(
        worker.request('invocationRequest', invocation(metadata, 'crash'), 'invocationResponse'),
        /Node execution engine exited unexpectedly/
    );
    const [code] = await worker.closed;
    assert.equal(code, 1, worker.stderr());
});
