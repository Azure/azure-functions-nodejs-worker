import { systemError } from './utils/Logger';
import { Duplex } from 'stream';
import * as grpc from 'grpc';
import * as protobuf from 'protobufjs';

// import protobufjs json descriptor
import * as jsonModule from '../azure-functions-language-worker-protobuf/src/rpc';
import rpc = jsonModule.AzureFunctionsRpcMessages;

interface GrpcClientConstructor {
    new(connection: string, credentials: any, options: any): GrpcClient;
}

function GetGrpcClientConstructor(): GrpcClientConstructor {
    let reflectionObject = protobuf.Root.fromJSON(jsonModule as protobuf.INamespace);
    let rpcs = grpc.loadObject(reflectionObject, { enumsAsStrings: false, protobufjsVersion: 6 });
    return rpcs.AzureFunctionsRpcMessages["FunctionRpc"];
}

interface GrpcClient extends grpc.Client {
    eventStream(): IEventStream
}

export interface IEventStream {
    write(message: rpc.IStreamingMessage);
    on(event: 'data', listener: (message: rpc.StreamingMessage) => void);
    on(event: string, listener: Function);
    end(): void;
}

export function CreateGrpcEventStream(connection: string, grpcMaxMessageLength: number): IEventStream {
    let GrpcClient = GetGrpcClientConstructor();
    let clientOptions = { 
        'grpc.max_send_message_length': grpcMaxMessageLength, 
        'grpc.max_receive_message_length': grpcMaxMessageLength 
    };
    let client = new GrpcClient(connection, grpc.credentials.createInsecure(), clientOptions);
    process.on('exit', code => {
        grpc.closeClient(client);
    });

    let eventStream = client.eventStream();

    eventStream.on('end', function () {
        eventStream.end();
        process.exit();
    });
    return eventStream;
}
