const grpcMessageHandlers = require('./grpcMessageHandlers');
const grpcMessageConverters = require('./grpcMessageConverters');

import * as jsonModule from '../protos/rpc.js';
const rpc = jsonModule.FunctionRpc;
const MessageType = rpc.StreamingMessage.Type;
import * as parseArgs from 'minimist';
import * as grpc from 'grpc';
import * as protobuf from 'protobufjs';

import { RpcClient, RpcClientFactory } from './rpcService';

let grpcClient: RpcClient;
let loadedFunctionsList = {};

process.on('exit', code => {
  if (grpcClient) {
    console.log('closing grpc');
    grpc.closeClient(grpcClient);
  }
});

process.on('uncaughtException', function (err) {
  // TODO -> wire this up to invocation context if possible
  console.log('unhandled exception!');
  console.log(err);
  if (grpcClient) {
    console.log('closing grpc');
    grpc.closeClient(grpcClient);
  }
});

/**
 * @param {Duplex} call The stream for incoming and outgoing messages
 */
function initiateDuplexStreaming(startStreamRequestId) {
  // TODO error handling if grpcClient is not initialized
  let call = grpcClient.eventStream();
  call.on('data', function (incomingMessage) {
    if (incomingMessage.content && incomingMessage.content.value) {
      console.log(`type: ${incomingMessage.type}`);
      switch (incomingMessage.type) {
        case MessageType.FunctionLoadRequest: {
          let loadRequest = rpc.FunctionLoadRequest.decode(incomingMessage.content.value);

          loadedFunctionsList = grpcMessageHandlers.handleFunctionLoadRequest(loadRequest, loadedFunctionsList);

          let loadResponse = rpc.FunctionLoadResponse.encode({
            functionId: loadRequest.functionId,
            result: {
              status: rpc.StatusResult.Status.Success,
              result: 'Loaded function'
            }
          }).finish();

          call.write({
            requestId: incomingMessage.requestId,
            type: MessageType.FunctionLoadResponse,
            content: {
              type_url: 'type.googleapis.com/FunctionRpc.FunctionLoadResponse',
              value: loadResponse
            }
          });
          break;
        }
        case MessageType.InvocationRequest: {
          let invocationRequest = rpc.InvocationRequest.decode(incomingMessage.content.value);
          grpcMessageHandlers.handleInvokeRequest(invocationRequest, call, incomingMessage.requestId, loadedFunctionsList);
          break;
        }
        default: {
          throw new Error(`Unknown message type ${incomingMessage.type}`);
        }
      }
    }
  });
  call.on('error', function (err) {
    console.log('grpc error..' + err);
  });
  call.on('end', function () {
    call.end();
  });

  console.log('Initiating Duplex event stream channel');
  call.write({
    requestId: startStreamRequestId,
    type: MessageType.StartStream,
    content: {
      type_url: "type.googleapis.com/FunctionRpc.StartStream",
      value: rpc.StartStream.encode({}).finish()
    }
  });
}

function GetRpcFactory(): RpcClientFactory {
  let reflectionObject = protobuf.Root.fromJSON(jsonModule);
  let rpcs = grpc.loadObject(reflectionObject, { enumsAsStrings: false, protobufjsVersion: 6 });
  return rpcs.FunctionRpc.FunctionRpc;
}

let argv = parseArgs(process.argv.slice(2));
if (typeof argv.host === 'undefined' || typeof argv.port === 'undefined' || typeof argv.requestId === 'undefined') {
  console.log('usage --host hostName --port portNumber --requestId requestId');
  throw new Error('Connection info missing');
}
let grpcConnectionString = argv.host + ':' + argv.port;
try {
  let rpcConstructor = GetRpcFactory();
  grpcClient = new rpcConstructor(grpcConnectionString, grpc.credentials.createInsecure());
  console.log('NodeJS Worker created...');
} catch (err) {
  console.log(err);
}

initiateDuplexStreaming(argv.requestId);