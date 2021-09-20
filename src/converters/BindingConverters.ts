import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { FunctionInfo } from '../FunctionInfo';
import { Dict } from '../Context';
import { BindingDefinition } from '../public/Interfaces';
import { fromTypedData } from './RpcConverters';

type BindingDirection = 'in' | 'out' | 'inout' | undefined;

export function getBindingDefinitions(info: FunctionInfo): BindingDefinition[] {
  const bindings = info.bindings;
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
  const bindingData: Dict<any> = {
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
export function convertKeysToCamelCase(obj: any) {
  var output = {};
  for (var key in obj) {
      // Only "undefined" will be replaced with original object property. For example:
      //{ string : "0" } -> 0
      //{ string : "false" } -> false
      //"test" -> "test" (undefined returned from fromTypedData)
      let valueFromDataType = fromTypedData(obj[key]);
      let value = valueFromDataType === undefined ? obj[key] : valueFromDataType;
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
