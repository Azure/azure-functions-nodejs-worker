import { FunctionRpc as messages } from '../protos/rpc.js';

function convertFromRpcHttp(rpcHttp: messages.RpcHttp$Properties) {
  // Get Request
  let httpContext: any = {
    method: rpcHttp.method,
    originalUrl: rpcHttp.url,
    headers: rpcHttp.headers,
    query: rpcHttp.query,
    params: rpcHttp.params,
    rawBody: rpcHttp.rawBody,
    body: convertFromTypedData(rpcHttp.body)
  };

  return httpContext;
}

function convertToRpcHttp(inputMessage) {
  let isRawResponse = true;

  let httpMessage: messages.RpcHttp$Properties = inputMessage;
  httpMessage.statusCode = (inputMessage.statusCode || inputMessage.status).toString();

  httpMessage.body = getTypedDataFromObject(inputMessage.body);
  return httpMessage;
}

function convertFromTypedData(typedData: messages.TypedData$Properties = {}) {
  switch (typedData.typeVal) {
    case messages.TypedData.Type.String:
    case messages.TypedData.Type.Json:
    default: {
      let parsedJson = typedData.stringVal;
      try {
        parsedJson = JSON.parse(<string>typedData.stringVal);
        return parsedJson;
      } catch (error) {
        return parsedJson;
      }
    }
    case messages.TypedData.Type.Bytes: {
      return new Buffer(<Uint8Array>typedData.bytesVal);
    }
  }
}

function getStringForObject(inputObject) {
  if (typeof (inputObject) === 'string') {
    return inputObject;
  } else if (Buffer.isBuffer(inputObject) || ArrayBuffer.isView(inputObject)) {
    let inputString = String.fromCharCode.apply(null, inputObject);
    try {
      return JSON.parse(inputString);
    } catch (error) {
      return inputString;
    }
  } else {
    return JSON.stringify(inputObject);
  }
}

function getTypedDataFromObject(inputObject): messages.TypedData$Properties {
  if (typeof inputObject === 'string') {
    return {
      typeVal: messages.TypedData.Type.String,
      stringVal: inputObject
    };
  } else if (Buffer.isBuffer(inputObject) || ArrayBuffer.isView(inputObject)) {
    return {
      typeVal: messages.TypedData.Type.Bytes,
      bytesVal: new Uint8Array(inputObject.buffer)
    };
  } else {
    return {
      typeVal: messages.TypedData.Type.String,
      stringVal: JSON.stringify(inputObject)
    }
  }
}

module.exports = {
  convertFromRpcHttp: convertFromRpcHttp,
  convertToRpcHttp: convertToRpcHttp,
  convertFromTypedData: convertFromTypedData,
  getStringForObject: getStringForObject,
  getTypedDataFromObject: getTypedDataFromObject
};