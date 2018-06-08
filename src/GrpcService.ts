import * as semver from 'semver';

if (!semver.satisfies(process.version, '8.x')) {
  let errorMessage = `Your Function App is currently set to use current version ${process.version}, but the runtime requires Node 8.x.
  For delpoyed code, please change WEBSITE_NODE_DEFAULT_VERSION in App Settings. On your local machine, you can change node version using 'nvm' (make sure to 'Quit' VSCode and start again instead of reloading it when you change the node version)`;
  console.error(errorMessage);
  throw new Error(errorMessage);
} 

import { Duplex } from 'stream';
import * as grpc from 'grpc';
import * as protobuf from 'protobufjs';

// import protobufjs json descriptor
import * as jsonModule from '../azure-functions-language-worker-protobuf/src/rpc';
import rpc = jsonModule.FunctionRpc;

interface GrpcClientConstructor {
    new(connection: string, credentials: any, options: any): GrpcClient;
}

function GetGrpcClientConstructor(): GrpcClientConstructor {
    let reflectionObject = protobuf.Root.fromJSON(jsonModule as protobuf.NamespaceDescriptor);
    let rpcs = grpc.loadObject(reflectionObject, { enumsAsStrings: false, protobufjsVersion: 6 });
    return rpcs.FunctionRpc.FunctionRpc;
}

interface GrpcClient {
    eventStream(): IEventStream
}

export interface IEventStream {
    write(message: rpc.StreamingMessage$Properties);
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
