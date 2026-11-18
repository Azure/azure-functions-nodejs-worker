// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

'use strict';

const path = require('node:path');
const { EventEmitter } = require('node:events');
const { Console } = require('node:console');
const { context, propagation, defaultTextMapSetter } = require('@opentelemetry/api');
const { AsyncLocalStorageContextManager } = require('@opentelemetry/context-async-hooks');
const { W3CTraceContextPropagator } = require('@opentelemetry/core');

// Binary stdout is private IPC; console logging must never corrupt the protocol.
global.console = new Console(process.stderr, process.stderr);
let reportError = (error) => console.error('Internal Node.js engine failed:', error);

async function main() {
    const [engineDirectory, workerId, maxLength, propagate, clientInstrumentations = 'none'] = process.argv.slice(2);
    const limit = Number(maxLength);
    if (!engineDirectory || !workerId || !Number.isSafeInteger(limit) || limit <= 0) {
        throw new Error('Invalid internal engine arguments');
    }
    const load = (file) => require(path.join(engineDirectory, 'dist', file));
    const { AzureFunctionsRpcMessages: rpc } = load(
        path.join('azure-functions-language-worker-protobuf', 'src', 'rpc.js')
    );
    const { worker } = load(path.join('src', 'WorkerContext.js'));
    const { ensureErrorType } = load(path.join('src', 'errors.js'));
    const { sanitizeErrorString } = load(path.join('src', 'utils', 'errorSanitizer.js'));
    reportError = (error) => {
        const normalized = ensureErrorType(error);
        console.error('Internal Node.js engine failed:', sanitizeErrorString(normalized.stack || normalized.message));
    };
    const eventStream = new EventEmitter();
    const propagator = new W3CTraceContextPropagator();
    const writeFrame = (bytes, carrier) => {
        if (bytes.length > limit) throw new Error('Engine response exceeds the host gRPC message limit');
        const metadata = Buffer.from(JSON.stringify(carrier));
        if (metadata.length > 4096) throw new Error('Engine trace context exceeds the IPC envelope limit');
        const header = Buffer.alloc(8);
        header.writeUInt32BE(4 + metadata.length + bytes.length, 0);
        header.writeUInt32BE(metadata.length, 4);
        process.stdout.write(Buffer.concat([header, metadata, bytes]));
    };
    eventStream.write = (message) => {
        const carrier = {};
        if (message.rpcLog) propagator.inject(context.active(), carrier, defaultTextMapSetter);
        writeFrame(rpc.StreamingMessage.encode(message).finish(), carrier);
    };
    eventStream.end = () => process.stdout.end();
    worker.id = workerId;
    worker.eventStream = eventStream;
    load(path.join('src', 'setupEventStream.js')).setupEventStream();
    load(path.join('src', 'setupCoreModule.js')).setupCoreModule();

    if (propagate === 'true') {
        if (!context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())) {
            throw new Error('Cannot register worker async context manager');
        }
        if (!propagation.setGlobalPropagator(propagator)) {
            throw new Error('Cannot register worker W3C propagator');
        }
    }
    const kinds = new Set(clientInstrumentations.split(',').filter((kind) => kind && kind !== 'none'));
    if (kinds.size > 0) {
        require('./instrumentation.cjs').install(kinds, (event) => writeFrame(Buffer.alloc(0), event));
    }
    const { registerHook } = load(path.join('src', 'hooks', 'registerHook.js'));
    const install = () =>
        registerHook('preInvocation', (hook) => {
            const invocation = hook.invocationContext;
            const triggerType = invocation.options?.trigger?.type;
            if (typeof triggerType === 'string' && triggerType.toLowerCase() === 'httptrigger') {
                const request = hook.inputs[0];
                if (request?.method) {
                    // Streaming hosts omit the HTTP method from RPC; the real request lives in Node.
                    writeFrame(Buffer.alloc(0), {
                        event: 'httpRequest',
                        invocationId: invocation.invocationId,
                        httpMethod: request.method,
                    });
                }
            }
            const carrier = invocation.traceContext;
            if (propagate === 'true' && carrier) {
                hook.functionCallback = context.bind(
                    propagation.extract(context.active(), {
                        traceparent: carrier.traceParent,
                        tracestate: carrier.traceState,
                    }),
                    hook.functionCallback
                );
            }
        });
    install();
    const resetApp = worker.resetApp.bind(worker);
    worker.resetApp = (...args) => {
        resetApp(...args);
        install();
    };

    const { isEnvironmentVariableSet } = load(path.join('src', 'utils', 'util.js'));
    if (isEnvironmentVariableSet(process.env.AZURE_FUNCTIONS_NODE_BLOCK_LOG)) {
        load(path.join('src', 'utils', 'blockedMonitor.js')).startBlockedMonitor(worker);
    }

    let buffer = Buffer.alloc(0);
    for await (const chunk of process.stdin) {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= 4) {
            const length = buffer.readUInt32BE(0);
            if (length > limit + 4096) throw new Error('Incoming engine frame exceeds the IPC context allowance');
            if (buffer.length < length + 4) break;
            const message = rpc.StreamingMessage.decode(buffer.subarray(4, length + 4));
            buffer = buffer.subarray(length + 4);
            eventStream.emit('data', message);
        }
    }
    if (buffer.length) throw new Error('Truncated worker IPC frame');
}

process.on('uncaughtException', (error) => {
    reportError(error);
    process.exit(1);
});
main()
    .then(() => process.exit(0))
    .catch((error) => {
        reportError(error);
        process.exit(1);
    });
