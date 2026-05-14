// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as grpc from '@grpc/grpc-js';
import type { ServiceClientConstructor } from '@grpc/grpc-js/build/src/make-client';
import * as grpcloader from '@grpc/proto-loader';
// import protobufjs json descriptor
import * as jsonModule from '../azure-functions-language-worker-protobuf/src/rpc';
import { AzFuncSystemError } from './errors';

import rpc = jsonModule.AzureFunctionsRpcMessages;

function GetGrpcClientConstructor(): ServiceClientConstructor {
    const packageDef = grpcloader.fromJSON(jsonModule as protobuf.INamespace, {
        objects: true,
        defaults: true,
        oneofs: true,
    });
    const serviceDef = packageDef['AzureFunctionsRpcMessages.FunctionRpc'] as grpcloader.ServiceDefinition;
    const clientConstructor: ServiceClientConstructor = grpc.makeClientConstructor(serviceDef, 'FunctionRpc');
    return clientConstructor;
}

export interface IEventStream {
    write(message: rpc.IStreamingMessage);
    on(event: 'data', listener: (message: rpc.StreamingMessage) => void);
    on(event: string, listener: Function);
    end(): void;
}

function validateConnectionUri(connectionUri: URL): URL {
    switch (connectionUri.protocol) {
        case 'http:':
        case 'https:':
            return connectionUri;
        default:
            throw new AzFuncSystemError(
                `Unsupported gRPC connection URI scheme '${
                    connectionUri.protocol
                }' in functions URI '${connectionUri.toString()}'. Expected 'http:' or 'https:'.`
            );
    }
}

export function getConnectionUri(connection: string | URL): URL {
    if (typeof connection !== 'string') {
        return validateConnectionUri(connection);
    }

    if (/^[A-Za-z][A-Za-z\d+\-.]*:\/\//.test(connection)) {
        return validateConnectionUri(new URL(connection));
    }

    // Older callers may still pass host:port instead of a full URI. Treat that as insecure
    // localhost-compatible http:// to avoid breaking the existing host contract.
    return validateConnectionUri(new URL(`http://${connection}`));
}

function getChannelCredentials(connectionUri: URL): grpc.ChannelCredentials {
    switch (connectionUri.protocol) {
        case 'http:':
            // Current hosts still treat host<->worker gRPC as trusted localhost IPC, so keep the
            // insecure fallback until they start advertising an https:// functions-uri.
            return grpc.credentials.createInsecure();
        case 'https:':
            return grpc.credentials.createSsl();
    }

    validateConnectionUri(connectionUri);
    return grpc.credentials.createInsecure();
}

export function CreateGrpcEventStream(connection: string | URL, grpcMaxMessageLength: number): IEventStream {
    const connectionUri = getConnectionUri(connection);
    const constructor: ServiceClientConstructor = GetGrpcClientConstructor();
    const clientOptions = {
        'grpc.max_send_message_length': grpcMaxMessageLength,
        'grpc.max_receive_message_length': grpcMaxMessageLength,
    };
    const client = new constructor(connectionUri.host, getChannelCredentials(connectionUri), clientOptions);
    process.on('exit', () => {
        grpc.closeClient(client);
    });

    const eventStream = client.eventStream();

    eventStream.on('end', function () {
        eventStream.end();
        process.exit();
    });
    return eventStream;
}
