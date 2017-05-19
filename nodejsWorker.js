var streamingMessage = require('./protos/FunctionRpc_pb').StreamingMessage;
var services = require('./protos/FunctionRpc_grpc_pb');

var parseArgs = require('minimist');

let path = require('path');
let grpc = require('grpc');

//TODO hook up unhandled exception handler
let globalInitializationScript = require('./azurefunctions/functions.js').globalInitialization;
let createFunction = require('./azurefunctions/functions.js').createFunction;
let clearRequireCacheScript = require('./azurefunctions/functions.js').clearRequireCache;

let unhandledExceptioError;
var grpcClient;
var loadedFunctionsList = {};

function isEmpty(obj) {
  for (let key in obj) {
    if (obj.hasOwnProperty(key)) { return false; }
  }
  return true;
}

function getContextHttpRequest(inputHttpRequest) {

  // Get Request
  let contextHttpRequest = {};

  contextHttpRequest['method'] = inputHttpRequest['method'];
  contextHttpRequest['originalUrl'] = inputHttpRequest['url'];
  contextHttpRequest['headers'] = inputHttpRequest['headers'];
  contextHttpRequest['query'] = inputHttpRequest['query'];
  if (inputHttpRequest['rawBody']) {
    contextHttpRequest['rawBody'] = inputHttpRequest['rawBody'];
  }
  if (inputHttpRequest['params']) {
    contextHttpRequest.params = {};
    for (let key in inputHttpRequest['params']) {
      if (inputHttpRequest['params'].hasOwnProperty(key)) {
        let binArrayInputs = inputHttpRequest['params'][key];
        let triggerInputString = String.fromCharCode.apply(null, binArrayInputs);
        // let triggerInputJSON = JSON.parse(triggerInputString);
        console.log(key + ' -> ' + triggerInputString);
        contextHttpRequest.params[key] = triggerInputString;
      }
    }
  }
  let requestBody = inputHttpRequest['body'];
  if (requestBody) {
    contextHttpRequest['body'] = getValueFromTypedData(requestBody);
  }
  return contextHttpRequest;
}

function isHttpRequestFirstInput(binArrayInputs) {
  let triggerInputString = String.fromCharCode.apply(null, binArrayInputs);
  try {
    let triggerInputJSON = JSON.parse(triggerInputString);
    if (triggerInputJSON['originalUrl']) {
      return true;
    }
  } catch (error) {
  }
  return false;
}

function getBytesForObject(inputObject) {
  let updatedBinding;
  if (typeof (inputObject) === 'string') {
    updatedBinding = inputObject;
  } else if (Buffer.isBuffer(inputObject)) {
    let inputString = String.fromCharCode.apply(null, inputObject);
    try {
      let inputJSON = JSON.parse(inputString);
      updatedBinding = inputJSON;
    } catch (error) {
      updatedBinding = inputString;
    }
  } else {
    updatedBinding = JSON.stringify(inputObject);
  }

  console.log(updatedBinding);
  let updatedBindingBuffer = new ArrayBuffer(updatedBinding.length); // 2 bytes for each char
  let updatedBindingBufferView = new Uint8Array(updatedBindingBuffer);
  for (let j = 0; j < updatedBinding.length; j++) {
    updatedBindingBufferView[j] = updatedBinding.charCodeAt(j);
  }
  return updatedBindingBufferView;
}

function getValueFromTypedData(typedData) {
  switch (typedData.type) {
    case TypedData.Type.String:
      return typedData.string_val;
    case TypedData.Type.Json:
    default:
      return JSON.parse(typedData.string_val);
    case TypedData.Type.Bytes:
      return TypedData.Type.bytes_val;
  }
}

function getTypedDataFromObject(inputObject) {
  let typedData = streamingMessage.TypedData();
  if (typeof (inputObject) === 'string') {
    typedData.setType(streamingMessage.TypedData.Type.String);
    typedData.setStringVal(inputObject);
  } else if (Buffer.isBuffer(inputObject)) {
    typedData.setType(streamingMessage.TypedData.Type.Bytes);
    typedData.setBytesVal(inputObject);
  }
  return typedData;
}

function getStringForObject(inputObject) {
  let updatedBinding;
  if (typeof (inputObject) === 'string') {
    return inputObject;
  } else if (Buffer.isBuffer(inputObject)) {
    let inputString = String.fromCharCode.apply(null, inputObject);
    try {
      let inputJSON = JSON.parse(inputString);
      updatedBinding = inputJSON;
    } catch (error) {
      updatedBinding = inputString;
    }
  } else {
    updatedBinding = JSON.stringify(inputObject);
  }

  console.log(updatedBinding);
  return updatedBinding;
}

function buildHttpMessage(inputMessage) {
  let httpMessage = {};
  if (inputMessage['method']) {
    httpMessage['method'] = inputMessage['method'];
  }
  if (inputMessage['rawBody']) {
    httpMessage['rawBody'] = inputMessage['rawBody'];
  }
  if (inputMessage['originalUrl']) {
    httpMessage['url'] = inputMessage['originalUrl'];
  }
  if (inputMessage['headers']) {
    httpMessage['headers'] = inputMessage['headers'];
  }
  if (inputMessage['query']) {
    httpMessage['query'] = inputMessage['query'];
  }
  if (inputMessage['statusCode']) {
    httpMessage['statusCode'] = inputMessage['statusCode'].toString();;
  }
  if (inputMessage['status'] && !httpMessage['statusCode']) {
    httpMessage['statusCode'] = inputMessage['status'].toString();;
  }
  if (inputMessage['body']) {
    httpMessage.httpMessageBody = {};
    httpMessage.httpMessageBody.httpMessageBodyDataValue = {};
    if (inputMessage['isRaw']) {
      httpMessage.isRaw = true;
    }
    if (inputMessage['headers'] && inputMessage['headers']['raw']) {
      httpMessage.httpMessageBody['httpMessageBodyType'] = rpcFunction.RpcDataType.Bytes;
    }
    let binArrayInputs = inputMessage['body'];
    if (Buffer.isBuffer(binArrayInputs)) {
      httpMessage.httpMessageBody['httpMessageBodyType'] = rpcFunction.RpcDataType.Bytes;
    }
    try {
      let inputJSON = JSON.parse(inputMessage['body']);
      if (inputJSON["type"] == "Buffer") {
        httpMessage.httpMessageBody['httpMessageBodyType'] = rpcFunction.RpcDataType.Bytes;
      }
    } catch (error) { }
    if (httpMessage.httpMessageBody['httpMessageBodyType'] === rpcFunction.RpcDataType.Bytes) {
      httpMessage.httpMessageBody.httpMessageBodyDataValue['bytesValue'] = binArrayInputs;
    } else {
      httpMessage.httpMessageBody.httpMessageBodyDataValue['stringValue'] = getStringForObject(inputMessage['body']);
    }
  }

  if (isEmpty(httpMessage)) {
    httpMessage.rawResponseDataValue = {};
    if (Buffer.isBuffer(inputMessage)) {
      httpMessage.rawResponseDataType = rpcFunction.RpcDataType.Bytes;
      httpMessage.rawResponseDataValue['bytesValue'] = inputMessage;
    } else {
      //httpMessage.rawResponseType = 'String';

      httpMessage.rawResponseDataValue['stringValue'] = getStringForObject(inputMessage);
    }
  }
  return httpMessage;
}

function terminateWorker(call, callback) {
  callback(null, {});
  process.exit(1);
}

function clearRequiredCache(call, callback) {
  Object.keys(require.cache).forEach(function (key) {
    delete require.cache[key];
  });
  callback(null, {});
}

function getUnpackedMessage(anyTypeMessage, messageType, messageTypeName) {
  let typeName = 'FunctionRpc' + messageTypeName;
  return anyTypeMessage.unpack(messageType, typeName);
}

function getPackedMessage(meesage, messageTypeName) {
  let typeName = 'FunctionRpc' + messageTypeName;
  var packedMessage = new proto.google.protobuf.Any;
  packedMessage.pack(meesage.serializeBinary(), typeName);
  return packedMessage;
}

function handleFunctionLoadRequest(functionLoadRequest) {

  let functionMetadata = {};
  functionMetadata.name = functionLoadRequest.FunctionMetadata.name;
  functionMetadata.directory = functionLoadRequest.FunctionMetadata.directory;
  functionMetadata.script_file = functionLoadRequest.FunctionMetadata.script_file;
  functionMetadata.entry_point = functionLoadRequest.FunctionMetadata.entry_point;
  //TODO handle updating existing function_id
  loadedFunctionsList[functionLoadRequest.function_id] = functionMetadata;

}

function handleInvokeRequest(functionInvokeMetadata) {
  let functionMetadata = loadedFunctionsList[functionLoadRequest.function_id];
  let scriptFilePath = functionMetadata.script_file;
  let invocationResponse = new streamingMessage.InvocationResponse();
  let statusResult = new streamingMessage.StatusResult();
  let context = {};

  invocationResponse.setRequestId(functionInvokeMetadata.getRequestId());
  invocationResponse.setInvocationId(functionInvokeMetadata.getInvocationId());

  process.on('uncaughtException', function (err) {
    context.handleUncaughtException(err.stack);
  });


  context.invocationId = functionInvokeMetadata.invocation_id;
  context.executionContext = {};
  context.executionContext.invocationId = functionInvokeMetadata.invocation_id;
  context.executionContext.functionName = functionMetadata.name;
  context.executionContext.functionDirectory = functionMetadata.directory;
  //TODO how to infer triggerType
  context._triggerType = functionInvokeMetadata.triggerType;

  // Get bindings
  context.bindings = {};

  if (functionMetadata.entry_point) {
    context._entryPoint = functionMetadata.entry_point;
  }

  // Get bindingData from trigger_metadata
  context.bindingData = {};
  for (let key in functionInvokeMetadata.trigger_metadata) {
    if (functionInvokeMetadata.trigger_metadata.hasOwnProperty(key)) {
      context.bindingData[key] = getValueFromTypedData(functionInvokeMetadata.trigger_metadata[key]);
    }
  }

  // Get _inputs from ParameterBindings
  context._inputs = [];
  context.req = {};
  for (let inputBindingsIndex = 0; inputBindingsIndex < functionInvokeMetadata.input_data.length; inputBindingsIndex++) {
    let parameterBinding = functionInvokeMetadata.input_data[inputBindingsIndex];
    let name = parameterBinding['name'];
    let typedData = parameterBinding['data'];

    if (typedData.Type == streamingMessage.TypedData.Type.Http) {
      context.req = getContextHttpRequest(typedDat.http_val);
      //TODO figure out webHookTrigger
      if (name != 'webhookReq') {
        context._inputs.push(context.req);
        context.bindings[name] = context.req;
      }
    }
    else {
      let inputDataValue = getValueFromTypedData(functionInvokeMetadata.input_data[inputBindingsIndex]['data']);
      context._inputs.push(inputDataValue);
      context.bindings[name] = inputDataValue;
    }
  }

  context.bind = function (p, callback) {
    for (let key in p) {
      if (p.hasOwnProperty(key)) {
        context.bindings[key] = p[key];
      }
    }
    if (typeof callback === 'function') {
      callback(null);
    }
  };

  var resultCallback = function (error, result) {


    if (error) {
      console.log(error);
      statusResult.setStatus(streamingMessage.StatusResult.Status.Failure);
      //TODO change type of result to Bytes instead of string?
      //functionInvokeMetadata.messageOutputs['result'] = getBytesForObject(error);
      statusResult.setResult(error.toString());
      invocationResponse.setResult(statusResult);

    }
    if (result) {
      console.log(result);
      statusResult.setStatus(streamingMessage.StatusResult.Status.Success);
      //functionInvokeMetadata.messageOutputs['result'] = getBytesForObject(error);
      statusResult.setResult(result.toString());
      let returnParamerterBinding = new streamingMessage.parameterBinding();
      returnParamerterBinding.setName('$return');
      returnParamerterBinding.setData(getTypedDataFromObject(result));
      invocationResponse.setResult(statusResult);
    }

    for (let key in context.bindings) {
      let outputParameterBinding = {};
      outputParameterBinding.setName(key);

      if (key === 'req' || key === 'request' || key == 'res') {
        let typedData = new streamingMessage.TypedData();
        typedData.setType(streamingMessage.TypedData.Type.Http);
        typedData.setHttpVal(buildHttpMessage(context.bindings[key]));
        outputParameterBinding.setData(typedData);
      }
      else {
        outputParameterBinding.setData(getTypedDataFromObject(context.bindings[key]));
        //TODO JSON and Number
      }
      invocationResponse.addOutputData(outputParameterBinding);
    }
    return result;
  };

  context.log = function (traceMessage) {
    let logMessage = new streamingMessage.LogMessage();
    logMessage.setInvocationId(context.invocationId);
    //TODO change to enum??
    logMessage.setCategory('Invocation');
    logMessage.setMessage(JSON.stringify(traceMessage));
    call.write(getPackedMessage(logMessage, 'Log'));
    console.log('traceMessage: ' + JSON.stringify(traceMessage));
  };

  context.handleUncaughtException = function (errorStack) {
    //TODO Should we log and self Terminate?
    if (errorStack) {
      console.log(errorStack);
      let exceptionMessage = new streamingMessage.Exception();
      exceptionMessage.setStackTrace(errorStack);

      statusResult.setStatus(streamingMessage.StatusResult.Status.Failure);
      statusResult.setException(exceptionMessage);
      invocationResponse.setResult(statusResult);

      call.write(getPackedMessage(invocationResponse, 'InvocationResponse'));
      // process.exit(1);
    }
  };

  let azureFunctionScript = createFunction(require(scriptFilePath));
  let azureFunctionScriptContext = [context, resultCallback];
  var invokeFunctionCode = azureFunctionScript.apply(invokeFunctionCode, azureFunctionScriptContext);
  // final response with the result
  call.write(getPackedMessage(invocationResponse, 'InvocationResponse'));
}

function handleWorkerInitRequest(WorkerInitRequest) {

}




/**
 * rpcInvokeFunction handler. Receives a stream of rpcFunctionInvokeMetadata, and responds
 * with a stream of updated rpcFunctionInvokeMetadata.
 * @param {Duplex} call The stream for incoming and outgoing messages
 */
function initiateDuplexStreaming(callback) {
  //TODO error handling if grpcClient is not initialized
  var call = grpcClient.eventStream();
  call.on('data', function (incomingMessage) {
    console.log('here...received incomingMessage');
    //Handle each message type
    switch (incomingMessage.type) {
      case streamingMessage.WorkerInitRequest:
        handleWorkerInitRequest(getUnpackedMessage(incomingMessage.content, streamingMessage.WorkerInitRequest, 'WorkerInitRequest'));

        break;
      case streamingMessage.WorkerTerminate:

        break;
      case streamingMessage.FileChangeEventRequest:

        break;
      case streamingMessage.FileChangeEventResponse:
        break;
      case streamingMessage.WorkerStatusRequest:
        break;
      case streamingMessage.FunctionLoadRequest:

        break;
      case streamingMessage.InvocationRequest:
        handleInvokeRequest(getUnpackedMessage(incomingMessage.content, streamingMessage.InvocationRequest, 'InvocationRequest'));
        break;
      default:
        throw new Error('Unknown streaming message type');
    }
  });


  let startStreamingMessage = new messages.StreamingMessage();
  let emptyStartMessage = new messages.StartStream();
  let anyEmptyStartMessage = new proto.google.protobuf.Any;
  anyEmptyStartMessage.pack(emptyStartMessage.serializeBinary(), 'FunctionRpc.StartStream');

  startStreamingMessage.setType(messages.StreamingMessage.Type.STARTSTREAM);
  startStreamingMessage.setContent(anyEmptyStartMessage);

  //Initiate Event Streaming RPC
  call.write(startStreamingMessage);

  call.on('end', function () {
    call.end();
  });
}

function main() {
  var argv = parseArgs(process.argv.slice(2));
  if (typeof argv.host == 'undefined' || typeof argv.port == 'undefined') {
    console.log('usage --host hostName --port portNumber');
    throw new Error('Connection info missing');
  }
  let grpcConnectionString = argv.host + ':' + argv.port;
  grpcClient = new services.FunctionRpcClient(grpcConnectionString, grpc.credentials.createInsecure());

  initiateDuplexStreaming();
}

main();
