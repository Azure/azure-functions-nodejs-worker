import * as semver from 'semver';

if (!semver.satisfies(process.version, '>=8.4.0')) {
  console.error(`azure-functions-nodejs-worker officially supports node version >=8.4.0. Current version ${process.version}.
To install required native modules for ${process.version}, install node-pre-gyp via 'npm i -g node-pre-gyp'.
Navigate to '<node-worker-dir>/grpc' and run 'node-pre-gyp install'`);
}

import { Duplex } from 'stream';
import * as grpc from 'grpc';
import * as protobuf from 'protobufjs';

// import protobufjs json descriptor
import * as jsonModule from '../protos/rpc';
import rpc = jsonModule.FunctionRpc;

interface GrpcClientConstructor {
    new(connection: string, credentials: any): GrpcClient;
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

export function CreateGrpcEventStream(connection: string): IEventStream {
    let GrpcClient = GetGrpcClientConstructor();
    let client = new GrpcClient(connection, grpc.credentials.createInsecure());
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