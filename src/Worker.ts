// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as parseArgs from 'minimist';
import { CreateGrpcEventStream } from './GrpcClient';
import { channel } from './WorkerChannel';
import { AzFuncSystemError, ensureErrorType } from './errors';
import { setupCoreModule } from './setupCoreModule';
import { setupEventStream } from './setupEventStream';
import { systemError, systemLog } from './utils/Logger';
import { startBlockedMonitor } from './utils/blockedMonitor';
import { isEnvironmentVariableSet } from './utils/util';

export function startNodeWorker(args) {
    const { host, port, workerId, requestId, grpcMaxMessageLength } = parseArgs(args.slice(2));
    if (!host || !port || !workerId || !requestId || !grpcMaxMessageLength) {
        systemLog(
            'usage --host hostName --port portNumber --workerId workerId --requestId requestId --grpcMaxMessageLength grpcMaxMessageLength'
        );
        // Find which arguments are in error
        const debugInfo: string[] = [];
        if (!host) debugInfo.push(`'hostName' is ${host}`);
        if (!port) debugInfo.push(`'port' is ${port}`);
        if (!workerId) debugInfo.push(`'workerId' is ${workerId}`);
        if (!requestId) debugInfo.push(`'requestId' is ${requestId}`);
        if (!grpcMaxMessageLength) debugInfo.push(`'grpcMaxMessageLength' is ${grpcMaxMessageLength}`);

        throw new AzFuncSystemError(`gRPC client connection info is missing or incorrect (${debugInfo.join(', ')}).`);
    }
    channel.workerId = workerId;

    const connection = `${host}:${port}`;
    systemLog(`Worker ${workerId} connecting on ${connection}`);

    try {
        channel.eventStream = CreateGrpcEventStream(connection, parseInt(grpcMaxMessageLength));
    } catch (err) {
        const error = ensureErrorType(err);
        error.isAzureFunctionsSystemError = true;
        error.message = 'Error creating GRPC event stream: ' + error.message;
        throw error;
    }

    setupEventStream();
    setupCoreModule();

    channel.eventStream.write({
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
        startBlockedMonitor(channel);
    }
}
