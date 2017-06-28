import { Duplex } from 'stream';
import { FunctionRpc as rpc } from '../protos/rpc';

export interface RpcClientFactory {
    new(connection: string, credentials: any): RpcClient;
}

export interface RpcClient {
    eventStream(): EventStream
}

export interface EventStream extends Duplex {
    write(message: rpc.StreamingMessage$Properties);
    on(event: "data", listener: (message: rpc.StreamingMessage) => void);
    on(event: string, listener: Function);
}