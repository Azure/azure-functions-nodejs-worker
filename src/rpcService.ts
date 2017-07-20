import { Duplex } from 'stream';
import * as grpc from 'grpc';
import * as protobuf from 'protobufjs';
import * as jsonModule from '../protos/rpc';
import rpc = jsonModule.FunctionRpc;

interface RpcConstructor {
    new(connection: string, credentials: any): RpcClient;
}

function GetConstructor(): RpcConstructor {
  let reflectionObject = protobuf.Root.fromJSON(jsonModule as protobuf.NamespaceDescriptor);
  let rpcs = grpc.loadObject(reflectionObject, { enumsAsStrings: false, protobufjsVersion: 6 });
  return rpcs.FunctionRpc.FunctionRpc;
}

interface RpcClient {
    eventStream(): EventStream
}

export interface EventStream extends Duplex {
    write(message: rpc.StreamingMessage$Properties);
    on(event: 'data', listener: (message: rpc.StreamingMessage) => void);
    on(event: 'functionLoadRequest', listener: (requestId: string, message: rpc.FunctionLoadRequest) => void);
    on(event: 'invocationRequest', listener: (requestId: string, message: rpc.InvocationRequest) => void);
    
    on(event: string, listener: Function);
}

export function CreateEventStream(connection: string): EventStream {
    let client = new (GetConstructor())(connection, grpc.credentials.createInsecure());
    process.on('exit', code => {
        console.log(code);
        grpc.closeClient(client);
    });
    process.on('uncaughtException', err => {
        console.error(err);
        process.exit(1);
    });
    let eventStream = client.eventStream();
    let oldWrite = eventStream.write;
    eventStream.write = function checkWrite(msg) {
        let msgError = rpc.StreamingMessage.verify(msg);
        if (msgError) {
            console.log(msgError);
        }
        oldWrite.apply(eventStream, arguments);
    }
    return eventStream;
}