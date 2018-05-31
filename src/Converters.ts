import { FunctionRpc as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { HttpRequest } from './http/Request';
import { IDict } from './Context';
export function fromRpcHttp(rpcHttp: rpc.RpcHttp$Properties) {
  let httpContext: HttpRequest = {
    method: <string>rpcHttp.method,
    url: <string>rpcHttp.url,
    originalUrl: <string>rpcHttp.url,
    headers: rpcHttp.headers,
    query: rpcHttp.query,
    params: rpcHttp.params,
    body: fromTypedData(rpcHttp.body),
    rawBody: fromTypedData(rpcHttp.rawBody, false),
  };

  return httpContext;
}

export function toRpcHttp(inputMessage): rpc.TypedData$Properties {
    let httpMessage: rpc.RpcHttp$Properties = inputMessage;
    httpMessage.headers = toRpcHttpHeaders(inputMessage.headers);
    let status = inputMessage.statusCode || inputMessage.status;
    httpMessage.statusCode = status && status.toString();
    httpMessage.body = toTypedData(inputMessage.body);
    return { http: httpMessage };
}

export function toRpcHttpHeaders(inputHeaders: rpc.TypedData$Properties) {
  let rpcHttpHeaders: {[key: string]: string} = {};
  for (let key in inputHeaders) {
    if (inputHeaders[key] != null) {
      rpcHttpHeaders[key] = inputHeaders[key].toString();
    }
  }
  return rpcHttpHeaders;
}

export function fromTypedData(typedData?: rpc.TypedData$Properties, convertStringToJson: boolean = true) {
  typedData = typedData || {};
  let str = typedData.string || typedData.json;
  if (str !== undefined) {
    if (convertStringToJson) {
      try {
        str = JSON.parse(str);
      } catch (err) { }
    }
    return str;
  } else if (typedData.bytes) {
    return new Buffer(typedData.bytes);
  }
}

export function toTypedData(inputObject): rpc.TypedData$Properties {
  if (typeof inputObject === 'string') {
    return { string: inputObject };
  } else if (Buffer.isBuffer(inputObject)) {
    return { bytes: inputObject };
  } else if (ArrayBuffer.isView(inputObject)) {
    let bytes = new Uint8Array(inputObject.buffer, inputObject.byteOffset, inputObject.byteLength)
    return { bytes: bytes };
  } else if (typeof inputObject === 'number') {
    if (Number.isInteger(inputObject)) {
      return { int: inputObject };
    } else {
      return { double: inputObject };
    }
  } else {
    return { json: JSON.stringify(inputObject) };
  }
}

export function getNormalizedBindingData(request: rpc.InvocationRequest$Properties): IDict {
  let bindingData: IDict = {
    invocationId: request.invocationId
  };
  // node binding data is camel cased due to language convention
  if (request.triggerMetadata) {
    Object.assign(bindingData, convertKeysToCamelCase(request.triggerMetadata))
  }
  return bindingData;
}

// Recursively convert keys of objects to camel case
function convertKeysToCamelCase(obj: any) {
  var output = {};
  for (var key in obj) {
      let value = fromTypedData(obj[key]) || obj[key];
      let camelCasedKey = key.charAt(0).toLocaleLowerCase() + key.slice(1);
      // If the value is a JSON object (and not http, which is already cased), convert keys to camel case
      if (typeof value === 'object' && value.http == undefined) {
        output[camelCasedKey] = convertKeysToCamelCase(value);
      } else {
        output[camelCasedKey] = value;
    }
  }
  return output;
}