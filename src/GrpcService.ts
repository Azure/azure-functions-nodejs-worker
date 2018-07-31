import * as semver from 'semver';

// If user is not using Node.js v8 or v10, fail
if (!(semver.satisfies(process.version, '8.x') || semver.satisfies(process.version, '10.x'))) {
    let errorMessage = `Your Function App is currently set to use Node.js version ${process.version}, but the runtime requires an 8.x or 10.x version (ex: 8.11.1 or 10.6.0).
    For deployed code, please change WEBSITE_NODE_DEFAULT_VERSION in App Settings. On your local machine, you can change node version using 'nvm' (make sure to quit and restart your code editor to pick up the changes).`;
    console.error(errorMessage);
    throw new Error(errorMessage);
}

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
