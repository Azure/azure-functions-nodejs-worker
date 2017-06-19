'use strict';

const grpcMessageHandlers = require('./grpcMessageHandlers');
const grpcMessageConverters = require('./grpcMessageConverters');

let messages = require('./protos/FunctionRpc_pb');
let services = require('./protos/FunctionRpc_grpc_pb');
let parseArgs = require('minimist');
let grpc = require('grpc');
let grpcClient;
let loadedFunctionsList = {};

process.on('exit', code => {
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
    switch (incomingMessage.getType()) {
      case 10: {
        let functionLoadRequest = grpcMessageConverters.getUnpackedMessage(incomingMessage.getContent(), messages.FunctionLoadRequest, 'FunctionLoadRequest');
        let functionId = functionLoadRequest.getFunctionId();
        loadedFunctionsList = grpcMessageHandlers.handleFunctionLoadRequest(functionLoadRequest, loadedFunctionsList);
        let functionLoadResponseStreamingMessage = grpcMessageHandlers.buildFunctionLoadResponse(incomingMessage.getRequestId(), functionId);

        call.write(functionLoadResponseStreamingMessage);
        break;
      }
      case 12: {
        let invocationRequest = grpcMessageConverters.getUnpackedMessage(incomingMessage.getContent(), messages.InvocationRequest, 'InvocationRequest');
        grpcMessageHandlers.handleInvokeRequest(invocationRequest, call, incomingMessage.getRequestId(), loadedFunctionsList);
        break;
      }
      default: {
        throw new Error('Unknown message type');
      }
    }
  });

  let startStreamingMessage = grpcMessageHandlers.buildStartStream(startStreamRequestId);

  console.log('Initiating Duplex event stream channel');
  call.write(startStreamingMessage);
  call.on('error', function (err) {
    console.log('grpc error..' + err);
  });
  call.on('end', function () {
    call.end();
  });
}

function main() {
  let argv = parseArgs(process.argv.slice(2));
  if (typeof argv.host === 'undefined' || typeof argv.port === 'undefined' || typeof argv.requestId === 'undefined') {
    console.log('usage --host hostName --port portNumber --requestId requestId');
    throw new Error('Connection info missing');
  }
  let grpcConnectionString = argv.host + ':' + argv.port;
  try {
    grpcClient = new services.FunctionRpcClient(grpcConnectionString, grpc.credentials.createInsecure());
    console.log('NodeJS Worker created...');
  } catch (err) {
    console.log(err);
  }

  initiateDuplexStreaming(argv.requestId);
}

main();