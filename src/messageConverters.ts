import { FunctionRpc as rpc } from '../protos/rpc';
import { HttpRequest } from '../azurefunctions/http/request';

export function fromRpcHttp(rpcHttp: rpc.RpcHttp$Properties) {
  // Get Request
  let httpContext: HttpRequest = {
    method: <string>rpcHttp.method,
    url: <string>rpcHttp.url,
    originalUrl: <string>rpcHttp.url,
    headers: rpcHttp.headers,
    query: rpcHttp.query,
    params: rpcHttp.params,
    body: fromTypedData(rpcHttp.body)
  };

  return httpContext;
}

export function toRpcHttp(inputMessage): rpc.RpcHttp$Properties {
  let httpMessage: rpc.RpcHttp$Properties =  inputMessage;
  let status = inputMessage.statusCode || inputMessage.status;
  httpMessage.statusCode = status && status.toString();
  httpMessage.body = toTypedData(inputMessage.body);
  return httpMessage;
}

export function fromTypedData(typedData?: rpc.TypedData$Properties) {
  typedData = typedData || {};
  let str = typedData.string || typedData.json;
  if (str !== undefined) {
    try {
      str = JSON.parse(str);
    } catch (err) {}
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