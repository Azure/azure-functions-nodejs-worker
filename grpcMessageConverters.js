'use strict';

let messages = require('./protos/FunctionRpc_pb');

function convertFromRpcHttp(rpcHttp) {
  // Get Request
  let contextHttpRequest = {
    headers: {},
    query: {},
    params: {}
  };

  contextHttpRequest.method = rpcHttp.getMethod();
  contextHttpRequest.originalUrl = rpcHttp.getUrl();
  let inputHttpRequestHeaders = rpcHttp.getHeadersMap().toObject();
  for (let [key, value] of inputHttpRequestHeaders) {
    contextHttpRequest.headers[key] = value;
  }

  let inputHttpQueryParams = rpcHttp.getQueryMap().toObject();
  for (let [key, value] of inputHttpQueryParams) {
    contextHttpRequest.query[key] = value;
  }

  if (rpcHttp.getRawBody()) {
    contextHttpRequest.rawBody = rpcHttp.getRawBody();
  }

  let inputHttpRequestParams = rpcHttp.getParamsMap().toObject(false, messages.TypedData.toObject);
  for (let [key, value] of inputHttpRequestParams) {
    contextHttpRequest.params[key] = value;
  }
  if (rpcHttp.getBody()) {
    contextHttpRequest.body = this.convertFromTypedDataObject(rpcHttp.getBody());
  }
  return contextHttpRequest;
}

function convertToRpcHttp(inputMessage) {
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
    for (let headerKey in inputMessage['headers']) {
      httpMessage.getHeadersMap().set(headerKey, inputMessage['headers'][headerKey]);
    }
    isRawResponse = false;
  }
  if (inputMessage['query']) {
    for (let queryKey in inputMessage['query']) {
      httpMessage.getQueryMap().set(queryKey, inputMessage['query'][queryKey]);
    }
    isRawResponse = false;
  }
  if (inputMessage['statusCode']) {
    httpMessage.setStatusCode(inputMessage['statusCode'].toString());
    isRawResponse = false;
  }
  if (inputMessage['status'] && !httpMessage.getStatusCode()) {
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
      httpBody.setTypeVal(2);
    }
    if (Buffer.isBuffer(inputMessage['body']) || ArrayBuffer.isView(inputMessage['body'])) {
      httpBody.setTypeVal(2);
    }
    if (httpBody.getTypeVal() === 2 && !inputMessage['rawBody']) {
      httpBody.setBytesVal(inputMessage['body']);
    } else {
      httpBody.setStringVal(this.getStringForObject(inputMessage['body']));
    }
    httpMessage.setBody(httpBody);
  }

  if (isRawResponse) {
    let rawResponseTypedData = new messages.TypedData();
    if (Buffer.isBuffer(inputMessage) || ArrayBuffer.isView(inputMessage)) {
      rawResponseTypedData.setTypeVal(2);
      rawResponseTypedData.setBytesVal(inputMessage);
    } else {
      rawResponseTypedData.setTypeVal(0);
      rawResponseTypedData.setStringVal(this.getStringForObject(inputMessage));
    }
    httpMessage.setRawResponse(rawResponseTypedData);
  }
  return httpMessage;
}

function convertFromTypedData(typedData) {
  switch (typedData.typeVal) {
    case 0:
    case 1:
    default: {
      let parsedJson = typedData.stringVal;
      try {
        parsedJson = JSON.parse(typedData.stringVal);
        return parsedJson;
      } catch (error) {
        return parsedJson;
      }
    }
    case 2: {
      return Buffer.from(typedData.bytesVal);
    }
  }
}

function convertFromTypedDataObject(typedData) {
  switch (typedData.getTypeVal()) {
    case 0:
    case 1:
    default:
      {
        try {
          return JSON.parse(typedData.getStringVal());
        } catch (error) {
          return typedData.getStringVal();
        }
      }
    case 2:
      {
        return Buffer.from(typedData.getBytesVal());
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

function getTypedDataFromObject(inputObject) {
  let typedData = new messages.TypedData();
  if (typeof (inputObject) === 'string') {
    typedData.setTypeVal(0);
    typedData.setStringVal(inputObject);
  } else if (Buffer.isBuffer(inputObject) || ArrayBuffer.isView(inputObject)) {
    typedData.setTypeVal(2);
    typedData.setBytesVal(inputObject);
  } else {
    // TODO do we need JSON type?
    typedData.setTypeVal(0);
    typedData.setStringVal(JSON.stringify(inputObject));
  }
  return typedData;
}

function getUnpackedMessage(anyTypeMessage, messageType, messageTypeName) {
  let typeName = 'FunctionRpc.' + messageTypeName;
  let unpackedValue = anyTypeMessage.unpack(messageType.deserializeBinary, typeName);
  return unpackedValue;
}

function getPackedMessage(message, messageTypeName) {
  let typeName = 'FunctionRpc.' + messageTypeName;
  let packedMessage = new proto.google.protobuf.Any();
  packedMessage.pack(message.serializeBinary(), typeName);
  return packedMessage;
}

module.exports = {
  convertFromRpcHttp: convertFromRpcHttp,
  convertToRpcHttp: convertToRpcHttp,
  convertFromTypedData: convertFromTypedData,
  convertFromTypedDataObject: convertFromTypedDataObject,
  getStringForObject: getStringForObject,
  getTypedDataFromObject: getTypedDataFromObject,
  getUnpackedMessage: getUnpackedMessage,
  getPackedMessage: getPackedMessage
};