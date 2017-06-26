'use strict';

const grpcMessageConverters = require('./grpcMessageConverters');
let messages = require('./protos/FunctionRpc_pb');
let createFunction = require('./azurefunctions/functions.js').createFunction;

function handleFunctionLoadRequest(functionLoadRequest, loadedFunctionsList) {
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
  loadedFunctionsList[functionLoadRequest.getFunctionId()] = functionMetadata;
  return loadedFunctionsList;
}

function handleInvokeRequest(invocationRequest, call, requestId, loadedFunctionsList) {
  // TODO handle updating non-existing function_id
  let functionMetadata = loadedFunctionsList[invocationRequest.getFunctionId()];
  let scriptFilePath = functionMetadata.script_file;
  let invocationResponse = new messages.InvocationResponse();
  let statusResult = new messages.StatusResult();

  let context = {
    executionContext: {},
    bindings: {},
    bindingData: {},
    req: {},
    _inputs: []
  };

  invocationResponse.setInvocationId(invocationRequest.getInvocationId());

  context.invocationId = invocationRequest.getInvocationId();
  context.executionContext.invocationId = invocationRequest.getInvocationId();
  context.executionContext.functionName = functionMetadata.name;
  context.executionContext.functionDirectory = functionMetadata.directory;

  // Get bindings
  if (functionMetadata.entry_point) {
    context._entryPoint = functionMetadata.entry_point;
  }

  // Get bindingData from trigger_metadata

  let triggerMetadata = invocationRequest.getTriggerMetadataMap().toObject(false, messages.TypedData.toObject);
  for (let key in triggerMetadata) {
    context.bindingData[triggerMetadata[key][0]] = grpcMessageConverters.convertFromTypedData(triggerMetadata[key][1]);
  }

  // Get _inputs from ParameterBindings
  let inputDataList = invocationRequest.getInputDataList();
  for (let inputBindingsIndex = 0; inputBindingsIndex < inputDataList.length; inputBindingsIndex++) {
    let parameterBinding = inputDataList[inputBindingsIndex];
    let name = parameterBinding.getName();
    let typedData = parameterBinding.getData();

    // if (typedData.typeVal == messages.TypedData.Type.Http) {
    // TODO figure out how to use enum
    if (typedData) {
      if (typedData.getTypeVal() == 4) {
        context.req = grpcMessageConverters.convertFromRpcHttp(typedData.getHttpVal());
        context._triggerType = 'httptrigger';
        // TODO figure out webHookTrigger
        if (name != 'webhookReq') {
          context._inputs.push(context.req);
          context.bindings[name] = context.req;
        }
      } else {
        let inputDataValue = grpcMessageConverters.convertFromTypedDataObject(typedData);
        context._inputs.push(inputDataValue);
        context.bindings[name] = inputDataValue;
      }
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
      statusResult.setStatus(messages.StatusResult.Status.Failure);
      statusResult.setResult(error.toString());
      invocationResponse.setResult(statusResult);
    }
    if (result) {
      statusResult.setStatus(messages.StatusResult.Status.Success);
      statusResult.setResult(result.toString());
      let returnParamerterBinding = new messages.ParameterBinding();
      returnParamerterBinding.setName('$return');
      returnParamerterBinding.setData(grpcMessageConverters.getTypedDataFromObject(result));
      invocationResponse.setResult(statusResult);
      invocationResponse.addOutputData(returnParamerterBinding);
    }

    for (let key in context.bindings) {
      let outputParameterBinding = new messages.ParameterBinding();
      outputParameterBinding.setName(key);
      if (key === 'req' || key === 'request' || key == 'res') {
        let typedData = new messages.TypedData();
        // typedData.setTypeVal(messages.TypedData.Type.Http);
        typedData.setTypeVal(4);
        typedData.setHttpVal(grpcMessageConverters.convertToRpcHttp(context.bindings[key]));
        outputParameterBinding.setData(typedData);
      } else {
        outputParameterBinding.setData(grpcMessageConverters.getTypedDataFromObject(context.bindings[key]));
      }
      invocationResponse.addOutputData(outputParameterBinding);
    }
    statusResult.setStatus(messages.StatusResult.Status.Success);

    // final response with the result

    let invocationResponseStreamingMessage = new messages.StreamingMessage();
    invocationResponseStreamingMessage.setRequestId(requestId);
    invocationResponseStreamingMessage.setType(messages.StreamingMessage.Type.INVOCATIONRESPONSE);
    invocationResponseStreamingMessage.setContent(grpcMessageConverters.getPackedMessage(invocationResponse, 'InvocationResponse'));
    call.write(invocationResponseStreamingMessage);

    return result;
  };

  context.log = function (traceMessage) {
    let logMessage = new messages.RpcLog();
    logMessage.setInvocationId(context.invocationId);
    logMessage.setCategory('Invocation');
    logMessage.setMessage(JSON.stringify(traceMessage));

    let logStreamingMessage = new messages.StreamingMessage();
    logStreamingMessage.setType(messages.StreamingMessage.Type.RPCLOG);
    logStreamingMessage.setContent(grpcMessageConverters.getPackedMessage(logMessage, 'RpcLog'));

    call.write(logStreamingMessage);

    // console.log('traceMessage: ' + JSON.stringify(traceMessage));
  };

  context.handleUncaughtException = function (errorStack) {
    // TODO Log and self Terminate?
    if (errorStack) {
      console.log(errorStack);
      let exceptionMessage = new messages.RpcException();
      exceptionMessage.setStackTrace(errorStack);

      statusResult.setStatus(messages.StatusResult.Status.Failure);
      statusResult.setException(exceptionMessage);
      invocationResponse.setResult(statusResult);

      call.write(grpcMessageConverters.getPackedMessage(invocationResponse, 'InvocationResponse'));
      // process.exit(1);
    }
  };

  let azureFunctionScript = createFunction(require(scriptFilePath));
  let azureFunctionScriptContext = [context, resultCallback];
  var invokeFunctionCode = azureFunctionScript.apply(invokeFunctionCode, azureFunctionScriptContext);
}

function buildFunctionLoadResponse(requestId, functionId) {
  let statusResult = new messages.StatusResult();
  statusResult.setStatus(messages.StatusResult.Status.SUCCESS);
  statusResult.setResult('Loaded function');

  let functionLoadResponseMessage = new messages.FunctionLoadResponse();
  functionLoadResponseMessage.setFunctionId(functionId);
  functionLoadResponseMessage.setResult(statusResult);

  let antTypeMessage = new proto.google.protobuf.Any();
  antTypeMessage.pack(functionLoadResponseMessage.serializeBinary(), 'FunctionRpc.FunctionLoadResponse');

  let functionLoadResponseStreamingMessage = new messages.StreamingMessage();
  functionLoadResponseStreamingMessage.setRequestId(requestId);
  functionLoadResponseStreamingMessage.setType(messages.StreamingMessage.Type.FUNCTIONLOADRESPONSE);
  functionLoadResponseStreamingMessage.setContent(antTypeMessage);
  return functionLoadResponseStreamingMessage;
}

function buildStartStream(requestId) {
  let startStreamingMessage = new messages.StreamingMessage();
  let emptyStartMessage = new messages.StartStream();

  let anyEmptyStartMessage = new proto.google.protobuf.Any();
  anyEmptyStartMessage.pack(emptyStartMessage.serializeBinary(), 'FunctionRpc.StartStream');

  startStreamingMessage.setRequestId(requestId);
  startStreamingMessage.setType(messages.StreamingMessage.Type.STARTSTREAM);
  startStreamingMessage.setContent(anyEmptyStartMessage);
  return startStreamingMessage;
}

module.exports = {
  handleFunctionLoadRequest: handleFunctionLoadRequest,
  handleInvokeRequest: handleInvokeRequest,
  buildFunctionLoadResponse: buildFunctionLoadResponse,
  buildStartStream: buildStartStream
};