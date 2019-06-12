import { AzureFunctionsRpcMessages as rpc, IRpcClaimsIdentity, INullableString, IRpcClaim } from '../azure-functions-language-worker-protobuf/src/rpc';
import { FunctionInfo } from './FunctionInfo';
import { RequestProperties } from './http/Request';
import { Dict } from '../src/Context';
import { BindingDefinition, ClaimsIdentity, Claim, HttpMethod } from './public/Interfaces';

type BindingDirection = 'in' | 'out' | 'inout' | undefined;

export function fromRpcHttp(rpcHttp: rpc.IRpcHttp): RequestProperties {
  const httpContext: RequestProperties = {
    method: <HttpMethod>rpcHttp.method,
    url: <string>rpcHttp.url,
    originalUrl: <string>rpcHttp.url,
    headers: <Dict<string>>rpcHttp.headers,
    query: <Dict<string>>rpcHttp.query,
    params: <Dict<string>>rpcHttp.params,
    body: fromTypedData(<rpc.ITypedData>rpcHttp.body),
    rawBody: fromTypedData(<rpc.ITypedData>rpcHttp.rawBody, false),
  };

  if (rpcHttp.identities) {
    httpContext.user = rpcHttp.identities.map(fromRpcClaimsIdentity);
  }

  return httpContext;
}

export function fromRpcClaimsIdentity(rpcIdentity: IRpcClaimsIdentity): ClaimsIdentity {
  const identity: ClaimsIdentity = {
    authenticationType: fromNullableString(rpcIdentity.authenticationType),
    nameClaimType: fromNullableString(rpcIdentity.nameClaimType),
    roleClaimType: fromNullableString(rpcIdentity.roleClaimType),
    claims: rpcIdentity.claims ? rpcIdentity.claims.map(fromRpcClaim) : [],
  };

  return identity;
}

export function fromRpcClaim(rpcClaim: IRpcClaim): Claim {
  const claim: Claim = {
    value: rpcClaim.value || "",
    type: rpcClaim.type || "",
  };

  return claim;
}

export function fromNullableString(nullableString: INullableString | null | undefined): string | undefined {
  if (!nullableString) {
    return undefined;
  } else if (nullableString.value === undefined || nullableString.value === null) {
    return undefined;
  } else {
    return nullableString.value;
  }
}

export function toRpcHttp(inputMessage): rpc.ITypedData {
    let httpMessage: rpc.IRpcHttp = inputMessage;
    httpMessage.headers = toRpcHttpHeaders(inputMessage.headers);
    let status = inputMessage.statusCode || inputMessage.status;
    httpMessage.statusCode = status && status.toString();
    httpMessage.body = toTypedData(inputMessage.body);
    return { http: httpMessage };
}

export function toRpcHttpHeaders(inputHeaders: rpc.ITypedData) {
  let rpcHttpHeaders: {[key: string]: string} = {};
  for (let key in inputHeaders) {
    if (inputHeaders[key] != null) {
      rpcHttpHeaders[key] = inputHeaders[key].toString();
    }
  }
  return rpcHttpHeaders;
}

export function fromTypedData(typedData?: rpc.ITypedData, convertStringToJson: boolean = true) {
  typedData = typedData || {};
  let str = typedData.string || typedData.json;
  if (str !== undefined) {
    if (convertStringToJson) {
      try {
        if (str != null) {
          str = JSON.parse(str);
        }
      } catch (err) { }
    }
    return str;
  } else if (typedData.bytes) {
    return Buffer.from(<Buffer>typedData.bytes);
  }
}

export function toTypedData(inputObject): rpc.ITypedData {
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

export function getBindingDefinitions(info: FunctionInfo): BindingDefinition[] {
  let bindings = info.bindings;
  if (!bindings) {
    return [];
  }

  return Object.keys(bindings)
    .map(name => { return { 
        name: name,
        type: bindings[name].type || "", 
        direction: getDirectionName(bindings[name].direction)
      }; 
    });
}

export function getNormalizedBindingData(request: rpc.IInvocationRequest): Dict<any> {
  let bindingData: Dict<any> = {
    invocationId: request.invocationId
  };
  // node binding data is camel cased due to language convention
  if (request.triggerMetadata) {
    Object.assign(bindingData, convertKeysToCamelCase(request.triggerMetadata))
  }
  return bindingData;
}

function getDirectionName(direction: rpc.BindingInfo.Direction|null|undefined): BindingDirection {
  let directionName = Object.keys(rpc.BindingInfo.Direction).find(k => rpc.BindingInfo.Direction[k] === direction);
  return isBindingDirection(directionName)? directionName as BindingDirection : undefined;
}

function isBindingDirection(input: string | undefined): boolean {
  return (input == 'in' || input == 'out' || input == 'inout')
}

// Recursively convert keys of objects to camel case
function convertKeysToCamelCase(obj: any) {
  var output = {};
  for (var key in obj) {
      let value = fromTypedData(obj[key]) || obj[key];
      let camelCasedKey = key.charAt(0).toLocaleLowerCase() + key.slice(1);
      // If the value is a JSON object (and not array and not http, which is already cased), convert keys to camel case
      if (!Array.isArray(value) && typeof value === 'object' && value && value.http == undefined) {
        output[camelCasedKey] = convertKeysToCamelCase(value);
      } else {
        output[camelCasedKey] = value;
    }
  }
  return output;
}
