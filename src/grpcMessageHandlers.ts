const grpcMessageConverters = require('./grpcMessageConverters');
import { FunctionRpc as messages } from '../protos/rpc.js'; 
import { EventStream } from './rpcService';
let createFunction = require('../azurefunctions/functions.js').createFunction;

function handleFunctionLoadRequest(functionLoadRequest: messages.FunctionLoadRequest, loadedFunctionsList) {
  if (functionLoadRequest.functionId && functionLoadRequest.metadata) {
    loadedFunctionsList[functionLoadRequest.functionId] = functionLoadRequest.metadata;
  }
  return loadedFunctionsList;
}

function handleInvokeRequest(invocationRequest: messages.InvocationRequest, call: EventStream, requestId, loadedFunctionsList: messages.RpcFunctionMetadata$Properties[]) {
  // TODO handle updating non-existing function_id
  if (!invocationRequest.functionId || !invocationRequest.triggerMetadata) {
    throw new Error("Invalid invocation");
  }

  let functionMetadata: messages.RpcFunctionMetadata$Properties = loadedFunctionsList[invocationRequest.functionId];
  let scriptFilePath = <string>functionMetadata.scriptFile;

  let context: any = {
    invocationId: invocationRequest.invocationId,
    _entryPoint: functionMetadata.entryPoint,
    executionContext: {
      invocationId: invocationRequest.invocationId,
      functionName: functionMetadata.name,
      functionDirectory: functionMetadata.directory
    },
    bindings: {},
    bindingData: {},
    req: {},
    _inputs: []
  };

  let bindingData = invocationRequest.triggerMetadata;
  // Get bindingData from trigger_metadata
  for (let key in bindingData) {
    context.bindingData[key] = grpcMessageConverters.convertFromTypedData(bindingData[key]);
  }

  // Get _inputs from ParameterBindings
  for (let binding of invocationRequest.inputData || []) {
    if (binding.data && binding.name) {
      let input;
      if (binding.data.typeVal == messages.TypedData.Type.Http) {
        input = context.req = grpcMessageConverters.convertFromRpcHttp(binding.data.httpVal);
        context._triggerType = 'httptrigger';
      } else {
        input = grpcMessageConverters.convertFromTypedData(binding.data);
      }
      context._inputs.push(input);
      context.bindings[binding.name] = input;
    }
  }

  context.bind = function (p, callback) {
    Object.assign(context.bindings, p);
    if (typeof callback === 'function') {
      callback(null);
    }
  };

  var resultCallback = function (error, result) {
    let status: messages.StatusResult$Properties = {
      status: messages.StatusResult.Status.Success
    };

    if (error) {
      status.status = messages.StatusResult.Status.Failure;
      status.result = error.toString();
    }

    if (result) {
      context.bindings.$return = result;
      status.result = result.toString();
    }

    let response: messages.InvocationResponse$Properties = {
      invocationId: invocationRequest.invocationId,
      result: status
    }

    response.outputData = Object.keys(context.bindings)
      .map(key => {
        let typedData: messages.TypedData$Properties;
        if (key == 'res') {
          typedData = {
            typeVal: messages.TypedData.Type.Http,
            httpVal: grpcMessageConverters.convertToRpcHttp(context.bindings[key])
          }
        } else {
          typedData = grpcMessageConverters.getTypedDataFromObject(context.bindings[key]);
        }
        return <messages.ParameterBinding$Properties>{
          name: key,
          data: typedData
        }
      });

    var verification = messages.InvocationResponse.verify(response);

    call.write({
      requestId: requestId,
      type: messages.StreamingMessage.Type.InvocationResponse,
      content: {
        type_url: 'type.googleapis.com/FunctionRpc.InvocationResponse',
        value: messages.InvocationResponse.encode(response).finish()
      }
    });

    return result;
  };

  context.log = function (traceMessage) {
    call.write({
      type: messages.StreamingMessage.Type.RpcLog,
      content: {
        type_url: 'type.googleapis.com/FunctionRpc.RpcLog',
        value: messages.RpcLog.encode({
          invocationId: context.invocationId,
          category: 'Invocation',
          message: JSON.stringify(traceMessage)
        }).finish()
      }
    });
  };

  context.handleUncaughtException = function (errorStack) {
    // TODO Log and self Terminate?
    if (errorStack) {
      console.log(errorStack);
      // process.exit(1);
    }
  };

  let azureFunctionScript = createFunction(require(scriptFilePath));
  azureFunctionScript(context, resultCallback);
}

module.exports = {
  handleFunctionLoadRequest: handleFunctionLoadRequest,
  handleInvokeRequest: handleInvokeRequest,
};