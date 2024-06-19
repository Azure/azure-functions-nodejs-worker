// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as parseArgs from 'minimist';
import { AzFuncSystemError, ensureErrorType, trySetErrorMessage } from './errors';
import { CreateGrpcEventStream } from './GrpcClient';
import { setupCoreModule } from './setupCoreModule';
import { setupEventStream } from './setupEventStream';
import { startBlockedMonitor } from './utils/blockedMonitor';
import { systemError, systemLog } from './utils/Logger';
import { isEnvironmentVariableSet } from './utils/util';
import { worker } from './WorkerContext';

export function startNodeWorker(args) {
    const parsedArgs = parseArgs(args.slice(2));
    const uri = parsedArgs['functions-uri'];
    const workerId = parsedArgs['functions-worker-id'];
    const requestId = parsedArgs['functions-request-id'];
    const grpcMaxMessageLength = parsedArgs['functions-grpc-max-message-length'];
    if (!uri || !workerId || !requestId || !grpcMaxMessageLength) {
        systemLog(
            'usage --functions-uri uri --functions-worker-id workerId --functions-request-id requestId --functions-grpc-max-message-length grpcMaxMessageLength'
        );
        // Find which arguments are in error
        const debugInfo: string[] = [];
        if (!uri) debugInfo.push(`'functions-uri' is ${uri}`);
        if (!workerId) debugInfo.push(`'functions-worker-id' is ${workerId}`);
        if (!requestId) debugInfo.push(`'functions-request-id' is ${requestId}`);
        if (!grpcMaxMessageLength) debugInfo.push(`'functions-grpc-max-message-length' is ${grpcMaxMessageLength}`);

        throw new AzFuncSystemError(`gRPC client connection info is missing or incorrect (${debugInfo.join(', ')}).`);
    }
    worker.id = workerId;

    const connection = new URL(uri).host;
    systemLog(`Worker ${workerId} connecting on ${connection}`);

    try {
        worker.eventStream = CreateGrpcEventStream(connection, parseInt(grpcMaxMessageLength));
    } catch (err) {
        const error = ensureErrorType(err);
        error.isAzureFunctionsSystemError = true;
        const message = 'Error creating GRPC event stream: ' + error.message;
        trySetErrorMessage(error, message);
        throw error;
    }

    setupEventStream();
    setupCoreModule();

    worker.eventStream.write({
        requestId: requestId,
        startStream: {
            workerId: workerId,
        },
    });

    process.on('uncaughtException', (err: unknown) => {
        const error = ensureErrorType(err);
        let errorMessage: string;
        if (error.isAzureFunctionsSystemError) {
            errorMessage = `Worker uncaught exception: ${error.stack || err}`;
        } else {
            errorMessage = `Worker uncaught exception (learn more: https://go.microsoft.com/fwlink/?linkid=2097909 ): ${
                error.stack || err
            }`;
        }

        systemError(errorMessage);
        process.exit(1);
    });
    process.on('exit', (code) => {
        systemLog(`Worker ${workerId} exited with code ${code}`);
    });

    if (isEnvironmentVariableSet(process.env.AZURE_FUNCTIONS_NODE_BLOCK_LOG)) {
        startBlockedMonitor(worker);
    }
}
