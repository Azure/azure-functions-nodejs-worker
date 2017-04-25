
let path = require('path');
let grpc = require('grpc');

let PROTO_PATH = path.join(__dirname, '/RpcInvokeFunction.proto');
let scriptFilePath;
//TODO hook up unhandled exception handler
let globalInitializationScript = require('./azurefunctions/functions.js').globalInitialization;
let createFunction = require('./azurefunctions/functions.js').createFunction;
let clearRequireCacheScript = require('./azurefunctions/functions.js').clearRequireCache;

let rpcFunction = grpc.load(PROTO_PATH).RpcFunction;

let rpcWorkerHost = '127.0.0.1';
let nodejsWorkerPort = 50051;
let nodejsWorkerAddress = rpcWorkerHost + ':' + nodejsWorkerPort;
let unhandledExceptioError;

function isEmpty(obj) {
  for (let key in obj) {
    if (obj.hasOwnProperty(key)) { return false; }
  }
  return true;
}

function buildContextHttpRequest(context, inputHttpRequest) {

  // Get Request
  context.req = {};

  context.req['method'] = inputHttpRequest['method'];
  context.req['originalUrl'] = inputHttpRequest['url'];
  context.req['headers'] = inputHttpRequest['headers'];
  context.req['query'] = inputHttpRequest['query'];
  if (inputHttpRequest['rawBody']) {
    context.req['rawBody'] = inputHttpRequest['rawBody'];
  }
  if (inputHttpRequest['params']) {
    context.req.params = {};
    for (let key in inputHttpRequest['params']) {
      if (inputHttpRequest['params'].hasOwnProperty(key)) {
        let binArrayInputs = inputHttpRequest['params'][key];
        let triggerInputString = String.fromCharCode.apply(null, binArrayInputs);
        // let triggerInputJSON = JSON.parse(triggerInputString);
        console.log(key + ' -> ' + triggerInputString);
        context.req.params[key] = triggerInputString;
      }
    }
  }

  let requestBody = inputHttpRequest['httpMessageBody'];
  if (requestBody) {
    let requestBodyType = requestBody['httpMessageBodyType'];
    let requestBodyDataValue = requestBody['httpMessageBodyDataValue'];
    switch (requestBodyType) {
      case "String":
      default:
        let stringValue = requestBodyDataValue['stringValue'];
        try {
          let triggerInputJSON = JSON.parse(stringValue);
          console.log(' triggerInputJSON ' + triggerInputJSON);
          context.req['body'] = triggerInputJSON;
        } catch (error) {
          console.log(' stringValue ' + stringValue);
          context.req['body'] = stringValue;
        }
        break;
      case "Bytes":
        let bytesValue = requestBodyDataValue['bytesValue']
        context.req['body'] = bytesValue;
        break;
    }
  }
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
    //if (httpMessage.httpMessageBody['httpMessageBodyType'] === rpcFunction.RpcDataType.Bytes && !inputMessage['rawBody']) {
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


/**
 * rpcInvokeFunction handler. Receives a stream of rpcFunctionInvokeMetadata, and responds
 * with a stream of updated rpcFunctionInvokeMetadata.
 * @param {Duplex} call The stream for incoming and outgoing messages
 */
function rpcInvokeFunction(call) {
  call.on('data', function (rpcFunctionInvokeMetadata) {
    console.log('here...received rpc invoke');
    scriptFilePath = rpcFunctionInvokeMetadata.scriptFile;

    let context = {};

    process.on('uncaughtException', function (err) {
      context.handleUncaughtException(err.stack);
    });


    context.invocationId = rpcFunctionInvokeMetadata.invocationId;
    context._triggerType = rpcFunctionInvokeMetadata.triggerType;

    // Get bindings
    context.bindings = {};
    /*for (let key in rpcFunctionInvokeMetadata.bindings.messageBindings) {
      if (rpcFunctionInvokeMetadata.bindings.messageBindings.hasOwnProperty(key)) {
        let binArrayInputs = rpcFunctionInvokeMetadata.bindings.messageBindings[key];
        if (context._triggerType === 'blobTrigger') {
          context.bindings[key] = binArrayInputs;
        } else {
          let triggerInputString = String.fromCharCode.apply(null, binArrayInputs);
          try {
            let triggerInputJSON = JSON.parse(triggerInputString);
            context.bindings[key] = triggerInputJSON;
          } catch (error) {
            console.log(key + ' -> ' + triggerInputString);
            context.bindings[key] = triggerInputString;
          }
        }
      }
    }*/

    if (rpcFunctionInvokeMetadata.entryPoint) {
      context._entryPoint = rpcFunctionInvokeMetadata.entryPoint;
    }

    // Get bindingData
    context.bindingData = {};
    for (let key in rpcFunctionInvokeMetadata.triggerMetadata.messageBindingData) {
      if (rpcFunctionInvokeMetadata.triggerMetadata.messageBindingData.hasOwnProperty(key)) {
        let binArrayInputs = rpcFunctionInvokeMetadata.triggerMetadata.messageBindingData[key];
        let triggerInputString = String.fromCharCode.apply(null, binArrayInputs);
        // let triggerInputJSON = JSON.parse(triggerInputString);
        console.log(key + ' -> ' + triggerInputString);
        context.bindingData[key] = triggerInputString;
      }
    }

    // Get _inputs
    context._inputs = [];
    /*for (let inputsWithDataTypesIndex = 0; inputsWithDataTypesIndex < rpcFunctionInvokeMetadata.inputsWithDataTypes.length; inputsWithDataTypesIndex++) {
      let inputDataType = rpcFunctionInvokeMetadata.inputsWithDataTypes[inputsWithDataTypesIndex]['dataType'];
      let binArrayInputs = rpcFunctionInvokeMetadata.inputsWithDataTypes[inputsWithDataTypesIndex]['messageInputs'];
      if (inputsWithDataTypesIndex === 0 && isHttpRequestFirstInput(binArrayInputs)) {
        context._inputs.push(context.req);
        continue;
      }
      if (typeof (inputDataType) !== 'undefined' && (inputDataType === 'Binary' || inputDataType === 'Buffer')) {
        context._inputs.push(binArrayInputs);
      } else {
        let triggerInputString = String.fromCharCode.apply(null, binArrayInputs);
        try {
          let triggerInputJSON = JSON.parse(triggerInputString);
          console.log(' triggerInputJSON ' + triggerInputJSON);
          context._inputs.push(triggerInputJSON);
        } catch (error) {
          console.log(' triggerInputString ' + triggerInputString);
          context._inputs.push(triggerInputString);
        }
      }
    } */

    for (let inputBindingsIndex = 0; inputBindingsIndex < rpcFunctionInvokeMetadata.functionInputBindings.length; inputBindingsIndex++) {
      let name = rpcFunctionInvokeMetadata.functionInputBindings[inputBindingsIndex]['name'];
      let inputDataType = rpcFunctionInvokeMetadata.functionInputBindings[inputBindingsIndex]['dataType'];

      switch (inputDataType) {
        case "String":
        default:
          let stringValue = rpcFunctionInvokeMetadata.functionInputBindings[inputBindingsIndex]['dataValue']['stringValue'];
          try {
            let triggerInputJSON = JSON.parse(stringValue);
            console.log(' triggerInputJSON ' + triggerInputJSON);
            context._inputs.push(triggerInputJSON);
            context.bindings[name] = triggerInputJSON;
          } catch (error) {
            console.log(' stringValue ' + stringValue);
            context._inputs.push(stringValue);
            context.bindings[name] = stringValue;
          }
          break;
        case "Bytes":
          let bytesValue = rpcFunctionInvokeMetadata.functionInputBindings[inputBindingsIndex]['dataValue']['bytesValue']
          context._inputs.push(bytesValue);
          context.bindings[name] = bytesValue;
          break;
        case "Http":
          let httpMessageValue = rpcFunctionInvokeMetadata.functionInputBindings[inputBindingsIndex]['dataValue']['httpMessageValue'];
          buildContextHttpRequest(context, httpMessageValue);
          if (name != 'webhookReq') {
              context._inputs.push(context.req);
              context.bindings[name] = context.req;
          }
          break;
      }
    }

    context.bind = function (p, callback) {
      for (let key in p) {
        if (p.hasOwnProperty(key)) {
          context.bindings[key] = p[key];
        }
      }
      if (typeof callback === 'function') {
        // Call it, since we have confirmed it is callable
        callback(null);
      }
    };

    var resultCallback = function (error, result) {
      if (error) {
        console.log(error);
        rpcFunctionInvokeMetadata.messageOutputs['result'] = getBytesForObject(error);
      }
      if (result) {
        console.log(result);
        rpcFunctionInvokeMetadata.messageOutputs['result'] = getBytesForObject(result);
      }

      for (let key in context.bindings) {
        let outputBindingsItem = {};
        outputBindingsItem.dataValue = {};
        outputBindingsItem.name = key;
        if (key === 'req' || key === 'request' || key == 'res') {
          console.log('key -->' + key + JSON.stringify(context.bindings[key]));
          outputBindingsItem.dataType = rpcFunction.RpcDataType.Http;
          outputBindingsItem.dataValue.httpMessageValue = buildHttpMessage(context.bindings[key]);
        }
        else {
          let updatedBinding;
          if(typeof (context.bindings[key]) === 'string') {
            outputBindingsItem.dataType = rpcFunction.RpcDataType.String;
            outputBindingsItem.dataValue.stringValue = context.bindings[key];
          } else
          if (Number.isInteger(context.bindings[key])) {
            outputBindingsItem.dataType = rpcFunction.RpcDataType.Number;
            outputBindingsItem.dataValue.numberValue = context.bindings[key];
          } else {
            updatedBinding = JSON.stringify(context.bindings[key]);
            let updatedBindingJSON = JSON.parse(updatedBinding);
            if (updatedBindingJSON['type'] && updatedBindingJSON['type'] === 'Buffer') {
              outputBindingsItem.dataType = rpcFunction.RpcDataType.Bytes;
              outputBindingsItem.dataValue.bytesValue = context.bindings[key];
            } else {
              outputBindingsItem.dataType = rpcFunction.RpcDataType.String;
              outputBindingsItem.dataValue.stringValue = updatedBinding;
            }
          }
         // console.log(key + ' -> ' + updatedBinding);
        }
        rpcFunctionInvokeMetadata.functionOutputBindings.push(outputBindingsItem);
      }
      return result;
    };

    context.log = function (traceMessage) {
      let logMessage = {
        invocationId: rpcFunctionInvokeMetadata.invocationId
      };
      logMessage.logs = [];
      //logMessage.inputsWithDataTypes = {};
      //logMessage.functionOutputBindings = {};
      //logMessage.messageOutputs = {};
      // TODO add another property for invocationId
      traceMessage.msg = traceMessage['msg'];
      logMessage.logs.push(JSON.stringify(traceMessage));
      call.write(logMessage);
      console.log('traceMessage: ' + JSON.stringify(traceMessage));
    };

    context.handleUncaughtException = function (errorStack) {
      if (errorStack) {
        rpcFunctionInvokeMetadata.unhandledExceptionError = JSON.stringify(errorStack);
        call.write(rpcFunctionInvokeMetadata);
        // process.exit(1);
      }
    };

    let azureFunctionScript = createFunction(require(scriptFilePath));
    let azureFunctionScriptContext = [context, resultCallback];
    var invokeFunctionCode = azureFunctionScript.apply(invokeFunctionCode, azureFunctionScriptContext);
    // final response with the result
    call.write(rpcFunctionInvokeMetadata);
  });

  call.on('end', function () {
    call.end();
  });
}

/**
 * Get a new server with the handler functions in this file bound to the methods
 * it serves.
 * @return {Server} The new server object
 */
function getServer() {
  let server = new grpc.Server();
  server.addProtoService(rpcFunction.RpcFunction.service, {
    rpcInvokeFunction: rpcInvokeFunction,
    terminateWorker: terminateWorker,
    clearRequiredCache: clearRequiredCache
  });
  return server;
}

if (require.main === module) {
  let routeServer = getServer();
  routeServer.bind(nodejsWorkerAddress, grpc.ServerCredentials.createInsecure());
  routeServer.start();
  console.log('server started at: ' + nodejsWorkerAddress);
}

exports.getServer = getServer;
