import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { FunctionInfo } from '../FunctionInfo';
import { Dict } from '../Context';
import { BindingDefinition } from '../public/Interfaces';
import { fromTypedData } from './RpcConverters';

type BindingDirection = 'in' | 'out' | 'inout' | undefined;

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
