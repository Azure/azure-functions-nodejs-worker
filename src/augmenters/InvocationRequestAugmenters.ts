import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';

/**
 * Augments TriggerMetadata from invocation with $request.
 * @param request IInvocationRequest object
 */
export function augmentTriggerMetadata(request: rpc.IInvocationRequest) {
    var key: any, value: any;
    if (request.inputData) {
        request.inputData.forEach((element, _index, _array) => {
        let elementKeys = Object.keys(element);
        if (elementKeys) {
          for (let val of elementKeys) {
            if (element[val] && element[val].http) {
                key = element["name"];
                value = element[val];
                break;
              }
            }
          }
      });
    }
    if(request && request.triggerMetadata)
    {
      if(key && (request.triggerMetadata[key] === undefined || request.triggerMetadata[key] === null))
      {
        request.triggerMetadata[key] = value;
      }
      if((request.triggerMetadata["$request"] === undefined || request.triggerMetadata["$request"] === null))
      {
        request.triggerMetadata["$request"] = value;
      }
    }
}