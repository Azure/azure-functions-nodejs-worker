// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as grpc from '@grpc/grpc-js';
import { ServiceClientConstructor } from '@grpc/grpc-js/build/src/make-client';
import * as grpcloader from '@grpc/proto-loader';
// import protobufjs json descriptor
import * as jsonModule from '../azure-functions-language-worker-protobuf/src/rpc';

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

export function CreateGrpcEventStream(connection: string, grpcMaxMessageLength: number): IEventStream {
    const constructor: ServiceClientConstructor = GetGrpcClientConstructor();
    const clientOptions = {
        'grpc.max_send_message_length': grpcMaxMessageLength,
        'grpc.max_receive_message_length': grpcMaxMessageLength,
    };
    const client = new constructor(connection, grpc.credentials.createInsecure(), clientOptions);
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
