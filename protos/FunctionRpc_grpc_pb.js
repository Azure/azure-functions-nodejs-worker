// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('grpc');
var FunctionRpc_pb = require('./FunctionRpc_pb.js');
var google_protobuf_any_pb = require('google-protobuf/google/protobuf/any_pb.js');
var google_protobuf_duration_pb = require('google-protobuf/google/protobuf/duration_pb.js');

function serialize_FunctionRpc_StreamingMessage(arg) {
  if (!(arg instanceof FunctionRpc_pb.StreamingMessage)) {
    throw new Error('Expected argument of type FunctionRpc.StreamingMessage');
  }
  return new Buffer(arg.serializeBinary());
}

function deserialize_FunctionRpc_StreamingMessage(buffer_arg) {
  return FunctionRpc_pb.StreamingMessage.deserializeBinary(new Uint8Array(buffer_arg));
}


// Interface exported by the server.
var FunctionRpcService = exports.FunctionRpcService = {
  eventStream: {
    path: '/FunctionRpc.FunctionRpc/EventStream',
    requestStream: true,
    responseStream: true,
    requestType: FunctionRpc_pb.StreamingMessage,
    responseType: FunctionRpc_pb.StreamingMessage,
    requestSerialize: serialize_FunctionRpc_StreamingMessage,
    requestDeserialize: deserialize_FunctionRpc_StreamingMessage,
    responseSerialize: serialize_FunctionRpc_StreamingMessage,
    responseDeserialize: deserialize_FunctionRpc_StreamingMessage,
  },
};

exports.FunctionRpcClient = grpc.makeGenericClientConstructor(FunctionRpcService);
