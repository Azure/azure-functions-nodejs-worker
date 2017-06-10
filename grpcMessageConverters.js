'use strict';

let messages = require('./protos/FunctionRpc_pb');

module.exports = {
  'convertFromRpcHttp': function (rpcHttp) {
    // Get Request
    let contextHttpRequest = {};
    contextHttpRequest.headers = {};
    contextHttpRequest.query = {};
    contextHttpRequest.params = {};

    contextHttpRequest['method'] = rpcHttp.getMethod();
    contextHttpRequest['originalUrl'] = rpcHttp.getUrl();
    let inputHttpRequestHeaders = rpcHttp.getHeadersMap().toObject();
    for (let key in inputHttpRequestHeaders) {
      contextHttpRequest.headers[inputHttpRequestHeaders[key][0]] = inputHttpRequestHeaders[key][1];
    }
    let inputHttpQueryParams = rpcHttp.getQueryMap().toObject();
    for (let key in inputHttpQueryParams) {
      contextHttpRequest.query[inputHttpQueryParams[key][0]] = inputHttpQueryParams[key][1];
    }
    if (rpcHttp.getRawBody()) {
      contextHttpRequest['rawBody'] = rpcHttp.getRawBody();
    }
    let inputHttpRequestParams = rpcHttp.getParamsMap().toObject(false, messages.TypedData.toObject);
    for (let key in inputHttpRequestParams) {
      contextHttpRequest.params[inputHttpRequestParams[key][0]] = this.convertFromTypedData(inputHttpRequestParams[key][1]);
    }
    if (rpcHttp.getBody()) {
      contextHttpRequest['body'] = this.convertFromTypedDataObject(rpcHttp.getBody());
    }
    return contextHttpRequest;
  },

  'convertToRpcHttp': function (inputMessage) {
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
        // httpBody.setTypeVal(messages.TypedData.Type.Bytes);
        httpBody.setTypeVal(2);
      }
      if (Buffer.isBuffer(inputMessage['body']) || ArrayBuffer.isView(inputMessage['body'])) {
        // httpBody.setTypeVal(messages.TypedData.Type.Bytes);
        httpBody.setTypeVal(2);
      }
      // if (httpMessage.body.getTypeVal() === messages.TypedData.Type.Bytes) {
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
        // rawResponseTypedData.setTypeVal(messages.TypedData.Type.Bytes);
        rawResponseTypedData.setTypeVal(2);
        rawResponseTypedData.setBytesVal(inputMessage);
      } else {
        rawResponseTypedData.setTypeVal(0);
        rawResponseTypedData.setStringVal(this.getStringForObject(inputMessage));
      }
      httpMessage.setRawResponse(rawResponseTypedData);
    }
    return httpMessage;
  },

  'convertFromTypedData': function (typedData) {
    switch (typedData.typeVal) {
      // case TypedData.Type.String:
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

      // case TypedData.Type.Bytes:
    case 2: {
      return Buffer.from(typedData.bytesVal);
    }
    }
  },

  'convertFromTypedDataObject': function (typedData) {
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
  },

  'getStringForObject': function (inputObject) {
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
  },

  'getTypedDataFromObject': function (inputObject) {
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
  },

  'getUnpackedMessage': function (anyTypeMessage, messageType, messageTypeName) {
    let typeName = 'FunctionRpc.' + messageTypeName;
    let unpackedValue = anyTypeMessage.unpack(messageType.deserializeBinary, typeName);
    return unpackedValue;
  },

  'getPackedMessage': function (message, messageTypeName) {
    let typeName = 'FunctionRpc.' + messageTypeName;
    var packedMessage = new proto.google.protobuf.Any();
    packedMessage.pack(message.serializeBinary(), typeName);
    return packedMessage;
  }
};
