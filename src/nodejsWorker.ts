import * as parseArgs from 'minimist';
import * as grpc from 'grpc';

import { FunctionRpc as rpc } from '../protos/rpc';
import Status = rpc.StatusResult.Status;
import { CreateEventStream } from './rpcService';
import * as handle from './messageHandlers';
import { toTypedData, toRpcHttp } from './messageConverters';

export class FunctionInfo {
  public metadata: rpc.RpcFunctionMetadata$Properties;
  public outputBindings: {
    [key: string]: rpc.BindingInfo$Properties & { converter: (any) => rpc.TypedData$Properties }
  };
  public httpOutputName: string;

  constructor(metadata: rpc.RpcFunctionMetadata$Properties) {
    this.metadata = metadata;
    this.outputBindings = {};
    if (metadata.bindings) {
      let bindings = metadata.bindings;
      let httpBindingName = Object.keys(bindings)
        .filter(name => bindings[name].direction !== rpc.BindingInfo.Direction.in)
        .forEach(name => {
          if (bindings[name].type === 'http') {
            this.httpOutputName = name;
            this.outputBindings[name] = Object.assign(bindings[name], { converter: toRpcHttp });
          } else {
            this.outputBindings[name] = Object.assign(bindings[name], { converter: toTypedData });
          }
        });
    }
  }

  getBinding(name: string) {
    if (this.metadata && this.metadata.bindings) {
      return this.metadata.bindings[name];
    } else {
      throw `Binding ${name} not found`;
    }
  }
}

let loadedFunctions: {[k: string]: FunctionInfo } = {};

let { host, port, workerId, requestId } = parseArgs(process.argv.slice(2));
if (!host || !port || !workerId || !requestId) {
  console.log('usage --host hostName --port portNumber --workerId workerId --requestId requestId');
  throw new Error('Connection info missing');
}

let eventStream = CreateEventStream(`${host}:${port}`);
eventStream.on('error', function (err) {
  console.log(`event stream error: ${err}`);
});
eventStream.on('end', function () {
  eventStream.end();
});
eventStream.on('data', function (msg) {
  if (msg.content) {
    eventStream.emit(msg.content, msg.requestId, msg[msg.content]);
  }
});
eventStream.on('workerInitRequest', (id, msg) => {
  eventStream.write({
    requestId: id,
    workerInitResponse: {
      result: {
        status: Status.Success
      }
    }
  });
});
eventStream.on('functionLoadRequest', (id, msg) => {
  if (msg.functionId && msg.metadata) {
    loadedFunctions[msg.functionId] = new FunctionInfo(msg.metadata);

    eventStream.write({
      requestId: id,
      functionLoadResponse: {
        functionId: msg.functionId,
        result: {
          status: Status.Success
        }
      }
    });
  }
});
eventStream.on('invocationRequest', (id, msg) => {
  if (msg.functionId) {
    try {
      handle.invokeRequest(msg, eventStream, id, loadedFunctions[msg.functionId]);
    }
    catch (err) {
      eventStream.write({
        requestId: id,
        invocationResponse: {
          invocationId: msg.invocationId,
          result: <rpc.StatusResult>{
            status: Status.Failure,
            exception: {
              message: err.toString(),
              stackTrace: err.stack
            }
          }
        }
      });
    }
  }
});

eventStream.write({
  requestId: requestId,
  startStream: {
    workerId: workerId
  }
});
