import * as parseArgs from 'minimist';
import * as grpc from 'grpc';

import { FunctionRpc as rpc } from '../protos/rpc';
import Status = rpc.StatusResult.Status;
import { CreateEventStream } from './rpcService';
import * as handle from './messageHandlers';

let loadedFunctions = {};

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
    loadedFunctions[msg.functionId] = msg.metadata;
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