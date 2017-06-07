var streamingMessage = require('./protos/FunctionRpc_pb').StreamingMessage;
var messages = require('./protos/FunctionRpc_pb');
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
  contextHttpRequest.headers = {};
  contextHttpRequest.query = {};
  contextHttpRequest.params = {};

  contextHttpRequest['method'] = inputHttpRequest.getMethod();
  contextHttpRequest['originalUrl'] = inputHttpRequest.getUrl();
  let inputHttpRequestHeaders = inputHttpRequest.getHeadersMap().toObject();
  for (key in inputHttpRequestHeaders) {
    contextHttpRequest.headers[inputHttpRequestHeaders[key][0]] = inputHttpRequestHeaders[key][1];
  }
  let inputHttpQueryParams = inputHttpRequest.getQueryMap().toObject();
  for (key in inputHttpQueryParams) {
    contextHttpRequest.query[inputHttpQueryParams[key][0]] = inputHttpQueryParams[key][1];
  }
  if (inputHttpRequest.getRawBody()) {
    contextHttpRequest['rawBody'] = inputHttpRequest.getRawBody();
  }
  let inputHttpRequestParams = inputHttpRequest.getParamsMap().toObject(false, messages.TypedData.toObject);
  for (key in inputHttpRequestParams) {
    contextHttpRequest.params[inputHttpRequestParams[key][0]] = getValueFromTypedData(inputHttpRequestParams[key][1]);
  }
  if (inputHttpRequest.getBody()) {
    contextHttpRequest['body'] = getValueFromTypedDataObject(inputHttpRequest.getBody());
  }
  return contextHttpRequest;
}

function getValueFromTypedData(typedData) {
  switch (typedData.typeVal) {
    //case TypedData.Type.String:
    case 0:
    // return typedData.stringVal;
    //case TypedData.Type.Json:
    case 1:
    default:
      let parsedJson = typedData.stringVal;
      try {
        parsedJson = JSON.parse(typedData.stringVal);
        return parsedJson;
      } catch (error) {
        return parsedJson;
      }

    //case TypedData.Type.Bytes:
    case 2:
      return typedData.bytesVal;
  }
}

function getValueFromTypedDataObject(typedData) {
  switch (typedData.getTypeVal()) {
    //case TypedData.Type.String:
    case 0:
    // return typedData.stringVal;
    //case TypedData.Type.Json:
    case 1:
    default:
      try {
        return JSON.parse(typedData.getStringVal());
      } catch (error) {
        return typedData.getStringVal();
      }

    //case TypedData.Type.Bytes:
    case 2:
      return typedData.getBytesVal();
  }
}

function getTypedDataFromObject(inputObject) {
  let typedData = new messages.TypedData();
  if (typeof (inputObject) === 'string') {
    //typedData.setTypeVal(messages.TypedData.Type.String);
    typedData.setTypeVal(0);
    typedData.setStringVal(inputObject);
  } else if (Buffer.isBuffer(inputObject) || ArrayBuffer.isView(inputObject)) {
    //typedData.setTypeVal(messages.TypedData.Type.Bytes);
    typedData.setTypeVal(2);
    typedData.setBytesVal(inputObject);
  } else {
    //typedData.setTypeVal(messages.TypedData.Type.JSON);
    // TODO do we need JSON type?
    typedData.setTypeVal(0);
    typedData.setStringVal(JSON.stringify(inputObject));
  }
  return typedData;
}

function getStringForObject(inputObject) {
  let updatedBinding;
  if (typeof (inputObject) === 'string') {
    return inputObject;
  } else if (Buffer.isBuffer(inputObject) || ArrayBuffer.isView(inputObject)) {
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

  return updatedBinding;
}

function buildHttpMessage(inputMessage) {
  let isRawResponse = true;
  let httpMessage = new messages.RpcHttp();
  if (inputMessage['method']) {
    httpMessage.setMethod(inputMessage['method']);
    isRawResponse = false;
  }
  if (inputMessage['rawBody']) {
    httpMessage.setRawBody(inputMessage['rawBody']);
    isRawResponse = false;
  }
  if (inputMessage['originalUrl']) {
    httpMessage.setUrl(inputMessage['originalUrl']);
    isRawResponse = false;
  }
  if (inputMessage['headers']) {
    for (headerKey in inputMessage['headers']) {
      httpMessage.getHeadersMap().set(headerKey, inputMessage['headers'][headerKey])
    }
    isRawResponse = false;
  }
  if (inputMessage['query']) {
    for (queryKey in inputMessage['query']) {
      httpMessage.getQueryMap().set(headerKey, inputMessage['query'][queryKey])
    }
    isRawResponse = false;
  }
  if (inputMessage['statusCode']) {
    httpMessage.setStatusCode(inputMessage['statusCode'].toString());
    isRawResponse = false;
  }
  if (inputMessage['status'] && !httpMessage['statusCode']) {
    httpMessage.setStatusCode(inputMessage['status'].toString());
    isRawResponse = false;
  }
  if (inputMessage['body']) {
    isRawResponse = false;
    let httpBody = new messages.TypedData();
    if (inputMessage['isRaw']) {
      httpMessage.setIsRaw(true);
    }
    if (inputMessage['headers'] && inputMessage['headers']['raw']) {
      //httpBody.setTypeVal(messages.TypedData.Type.Bytes);
      httpBody.setTypeVal(2);
    }
    if (Buffer.isBuffer(inputMessage['body']) || ArrayBuffer.isView(inputMessage['body'])) {
      //httpBody.setTypeVal(messages.TypedData.Type.Bytes);
      httpBody.setTypeVal(2);
    }
    //if (httpMessage.body.getTypeVal() === messages.TypedData.Type.Bytes) {
    if (httpBody.getTypeVal() === 2 && !inputMessage['rawBody']) {
      httpBody.setBytesVal(inputMessage['body']);
    } else {
      httpBody.setStringVal(getStringForObject(inputMessage['body']));
    }
    httpMessage.setBody(httpBody);
  }

  if (isRawResponse) {
    let rawResponseTypedData = new messages.TypedData();
    if (Buffer.isBuffer(inputMessage) || ArrayBuffer.isView(inputMessage)) {
      //rawResponseTypedData.setTypeVal(messages.TypedData.Type.Bytes);
      rawResponseTypedData.setTypeVal(2);
      rawResponseTypedData.setBytesVal(inputMessage);
    } else {
      rawResponseTypedData.setTypeVal(0);
      rawResponseTypedData.setStringVal(getStringForObject(inputMessage));
    }
    httpMessage.setRawResponse(rawResponseTypedData);
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
  let typeName = 'FunctionRpc.' + messageTypeName;
  let unpackedValue = anyTypeMessage.unpack(messageType.deserializeBinary, typeName);
  return unpackedValue;
}

function getPackedMessage(message, messageTypeName) {
  let typeName = 'FunctionRpc.' + messageTypeName;
  var packedMessage = new proto.google.protobuf.Any;
  packedMessage.pack(message.serializeBinary(), typeName);
  return packedMessage;
}

function handleFunctionLoadRequest(functionLoadRequest) {
  let rpcFunctionMetadata = functionLoadRequest.getMetadata();
  let functionMetadata = {};
  functionMetadata.name = rpcFunctionMetadata.getName();
  functionMetadata.directory = rpcFunctionMetadata.getDirectory();
  if (rpcFunctionMetadata.getScriptFile()) {
    functionMetadata.script_file = rpcFunctionMetadata.getScriptFile();
  }
  if (rpcFunctionMetadata.getEntryPoint()) {
    functionMetadata.entry_point = rpcFunctionMetadata.getEntryPoint();
  }
  //TODO handle updating existing function_id
  loadedFunctionsList[functionLoadRequest.getFunctionId()] = functionMetadata;
  return functionLoadRequest.getFunctionId();
}

function handleInvokeRequest(invocationRequest, call, requestId) {
  //TODO handle updating non-existing function_id
  let functionMetadata = loadedFunctionsList[invocationRequest.getFunctionId()];
  let scriptFilePath = functionMetadata.script_file;
  let invocationResponse = new messages.InvocationResponse();
  let statusResult = new messages.StatusResult();
  let context = {};

  invocationResponse.setInvocationId(invocationRequest.getInvocationId());

  process.on('uncaughtException', function (err) {
    console.log('uncaught...' + err);
    context.handleUncaughtException(err.stack);
  });


  context.invocationId = invocationRequest.getInvocationId();
  context.executionContext = {};
  context.executionContext.invocationId = invocationRequest.getInvocationId();
  context.executionContext.functionName = functionMetadata.name;
  context.executionContext.functionDirectory = functionMetadata.directory;
  // TODO how to infer triggerType


  // Get bindings
  context.bindings = {};

  if (functionMetadata.entry_point) {
    context._entryPoint = functionMetadata.entry_point;
  }

  // Get bindingData from trigger_metadata
  context.bindingData = {};
  let triggerMetadata = invocationRequest.getTriggerMetadataMap().toObject(false, messages.TypedData.toObject);
  for (key in triggerMetadata) {
    context.bindingData[triggerMetadata[key][0]] = getValueFromTypedData(triggerMetadata[key][1]);
  }

  // Get _inputs from ParameterBindings
  context._inputs = [];
  context.req = {};
  let inputDataList = invocationRequest.getInputDataList();
  for (let inputBindingsIndex = 0; inputBindingsIndex < inputDataList.length; inputBindingsIndex++) {
    let parameterBinding = inputDataList[inputBindingsIndex];
    let name = parameterBinding.getName();
    let typedData = parameterBinding.getData();

    //if (typedData.typeVal == messages.TypedData.Type.Http) {
    // TODO figure out how to use enum
    if (typedData.getTypeVal() == 4) {
      context.req = getContextHttpRequest(typedData.getHttpVal());
      context._triggerType = 'httptrigger';
      //TODO figure out webHookTrigger
      if (name != 'webhookReq') {
        context._inputs.push(context.req);
        context.bindings[name] = context.req;
      }
    }
    else {
      let inputDataValue = getValueFromTypedDataObject(typedData);
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
      statusResult.setStatus(messages.StatusResult.Status.Failure);
      statusResult.setResult(error.toString());
      invocationResponse.setResult(statusResult);
    }
    if (result) {
      console.log(result);
      statusResult.setStatus(messages.StatusResult.Status.Success);
      statusResult.setResult(result.toString());
      let returnParamerterBinding = new messages.ParameterBinding();
      returnParamerterBinding.setName('$return');
      returnParamerterBinding.setData(getTypedDataFromObject(result));
      invocationResponse.setResult(statusResult);
      invocationResponse.addOutputData(returnParamerterBinding);
    }

    for (let key in context.bindings) {
      let outputParameterBinding = new messages.ParameterBinding();
      outputParameterBinding.setName(key);
      console.log('out binding...' + JSON.stringify(context.bindings[key]));

      if (key === 'req' || key === 'request' || key == 'res') {
        let typedData = new messages.TypedData();
        //typedData.setTypeVal(messages.TypedData.Type.Http);
        typedData.setTypeVal(4);
        typedData.setHttpVal(buildHttpMessage(context.bindings[key]));
        outputParameterBinding.setData(typedData);
      }
      else {
        outputParameterBinding.setData(getTypedDataFromObject(context.bindings[key]));
        //TODO JSON and Number
      }
      invocationResponse.addOutputData(outputParameterBinding);
    }
    statusResult.setStatus(messages.StatusResult.Status.Success);
    return result;
  };

  context.log = function (traceMessage) {
    let logMessage = new messages.RpcLog();
    logMessage.setInvocationId(context.invocationId);
    //TODO change to enum??
    logMessage.setCategory('Invocation');
    logMessage.setMessage(JSON.stringify(traceMessage));

    let logStreamingMessage = new messages.StreamingMessage();

    // logStreamingMessage.setRequestId(requestId);
    logStreamingMessage.setType(messages.StreamingMessage.Type.RPCLOG);
    logStreamingMessage.setContent(getPackedMessage(logMessage, 'RpcLog'));

    // TODO figure out live logging
    call.write(logStreamingMessage);

    //call.write(getPackedMessage(logMessage, 'Log'));
    console.log('traceMessage: ' + JSON.stringify(traceMessage));
  };

  context.handleUncaughtException = function (errorStack) {
    //TODO Should we log and self Terminate?
    if (errorStack) {
      console.log(errorStack);
      let exceptionMessage = new messages.RpcException();
      exceptionMessage.setStackTrace(errorStack);

      statusResult.setStatus(messages.StatusResult.Status.Failure);
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

  let invocationResponseStreamingMessage = new messages.StreamingMessage();

  invocationResponseStreamingMessage.setRequestId(requestId);
  invocationResponseStreamingMessage.setType(messages.StreamingMessage.Type.INVOCATIONRESPONSE);
  invocationResponseStreamingMessage.setContent(getPackedMessage(invocationResponse, 'InvocationResponse'));

  call.write(invocationResponseStreamingMessage);

}

function handleWorkerInitRequest(WorkerInitRequest) {

}

/**
 * rpcInvokeFunction handler. Receives a stream of rpcFunctionInvokeMetadata, and responds
 * with a stream of updated rpcFunctionInvokeMetadata.
 * @param {Duplex} call The stream for incoming and outgoing messages
 */
function initiateDuplexStreaming(startStreamRequestId) {
  //TODO error handling if grpcClient is not initialized
  var call = grpcClient.eventStream();
  call.on('data', function (incomingMessage) {
    console.log('here...received incomingMessage');
    //Handle each message type
    let incomingMessageType = incomingMessage.getType();
    switch (incomingMessageType) {
      //case streamingMessage.WorkerInitRequest:
      // TODO figure out using enum type
      case 0:
        handleWorkerInitRequest(getUnpackedMessage(incomingMessage.getContent(), messages.WorkerInitRequest, 'WorkerInitRequest'));

        break;
      case streamingMessage.WorkerTerminate:

        break;
      case streamingMessage.FileChangeEventRequest:

        break;
      case streamingMessage.FileChangeEventResponse:
        break;
      case streamingMessage.WorkerStatusRequest:
        break;
      //case streamingMessage.FunctionLoadRequest:
      case 10:
        let functionId = handleFunctionLoadRequest(getUnpackedMessage(incomingMessage.getContent(), messages.FunctionLoadRequest, 'FunctionLoadRequest'));
        let functionLoadResponseStreamingMessage = new messages.StreamingMessage();

        let functionLoadResponseMessage = new messages.FunctionLoadResponse();
        functionLoadResponseMessage.setFunctionId(functionId);

        let statusResult = new messages.StatusResult();
        statusResult.setStatus(messages.StatusResult.Status.SUCCESS);
        //TODO build proper statusResult
        statusResult.setResult('Loaded function');

        functionLoadResponseMessage.setResult(statusResult)

        let antTypeMessage = new proto.google.protobuf.Any;
        antTypeMessage.pack(functionLoadResponseMessage.serializeBinary(), 'FunctionRpc.FunctionLoadResponse');

        functionLoadResponseStreamingMessage.setRequestId(incomingMessage.getRequestId());
        functionLoadResponseStreamingMessage.setType(messages.StreamingMessage.Type.FUNCTIONLOADRESPONSE);
        functionLoadResponseStreamingMessage.setContent(antTypeMessage);

        //Initiate Event Streaming RPC
        call.write(functionLoadResponseStreamingMessage);
        break;
      //case streamingMessage.InvocationRequest:
      case 12:
        handleInvokeRequest(getUnpackedMessage(incomingMessage.getContent(), messages.InvocationRequest, 'InvocationRequest'), call, incomingMessage.getRequestId());
        break;
      default:
        throw new Error('Unknown streaming message type');
    }
  });


  let startStreamingMessage = new messages.StreamingMessage();
  let emptyStartMessage = new messages.StartStream();

  let anyEmptyStartMessage = new proto.google.protobuf.Any;
  anyEmptyStartMessage.pack(emptyStartMessage.serializeBinary(), 'FunctionRpc.StartStream');

  startStreamingMessage.setRequestId(startStreamRequestId);
  startStreamingMessage.setType(messages.StreamingMessage.Type.STARTSTREAM);
  startStreamingMessage.setContent(anyEmptyStartMessage);

  //Initiate Event Streaming RPC
  call.write(startStreamingMessage);
  call.on('error', function (err) {
    console.log('grpc erro..' + err);
  })
  call.on('end', function () {
    call.end();
  });
}

function main() {
  var argv = parseArgs(process.argv.slice(2));
  if (typeof argv.host == 'undefined' || typeof argv.port == 'undefined' || typeof argv.requestId == 'undefined') {
    console.log('usage --host hostName --port portNumber --requestId requestId');
    throw new Error('Connection info missing');
  }
  let grpcConnectionString = argv.host + ':' + argv.port;
  try {
    grpcClient = new services.FunctionRpcClient(grpcConnectionString, grpc.credentials.createInsecure());
    console.log('created client...');
  } catch (err) {
    console.log(err);
  }

  initiateDuplexStreaming(argv.requestId);
}

main();
