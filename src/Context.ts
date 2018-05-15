import { FunctionInfo } from './FunctionInfo';
import { fromRpcHttp, fromTypedData, toTypedData } from './Converters';
import { FunctionRpc as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { Request, HttpRequest } from './http/Request';
import { Response } from './http/Response';
import LogLevel = rpc.RpcLog.Level;

export interface IContext {
  invocationId: string;
  executionContext: IExecutionContext;
  bindings: IDict;
  bindingData: IDict;
  log: ILogger;
  req?: Request;
  res?: Response;
  done: IDoneCallback;
};

export function CreateContextAndInputs(info: FunctionInfo, request: rpc.InvocationRequest$Properties, logCallback: ILogCallback, callback: IResultCallback) {
  let context = new Context(info, request, logCallback, callback);

  let bindings: IDict = {};
  let inputs: any[] = [];
  let httpInput: HttpRequest | undefined;
  for (let binding of <rpc.ParameterBinding$Properties[]>request.inputData) {
    if (binding.data && binding.name) {
      let input: any;
      if (binding.data && binding.data.http) {
        input = httpInput = fromRpcHttp(binding.data.http);
      } else {
        input = fromTypedData(binding.data);
      }
      bindings[binding.name] = input;
      inputs.push(input);
    }
  }
  
  context.bindings = bindings;
  if (httpInput) {
    context.req = new Request(httpInput);
    context.res = new Response(context.done);
  }
  return {
    context: <IContext>context,
    inputs: inputs
  }
}

class Context implements IContext {
  invocationId: string;
  executionContext: IExecutionContext;
  bindings: IDict;
  bindingData: IDict;
  log: ILogger;
  req?: Request;
  res?: Response;
  done: IDoneCallback;

  constructor(info: FunctionInfo, request: rpc.InvocationRequest$Properties, logCallback: ILogCallback, callback: IResultCallback) {
    this.invocationId = <string>request.invocationId;
    this.executionContext = {
      invocationId: this.invocationId,
      functionName: <string>info.name,
      functionDirectory: <string>info.directory
    };

    this.log = getLogger(this.invocationId, this.executionContext.functionName, logCallback);
    this.bindingData = getNormalizedBindingData(request);

    let _done = false;
    let _promise = false;
    // isPromise is a hidden parameter that we set to true in the event of a returned promise
    this.done = (err?: any, result?: any, isPromise?: boolean) => {
      if (_done) {
        if (_promise) {
          this.log.error("Error: Choose either to return a promise or call 'done'.  Do not use both in your script.");
        } else {
          this.log.error("Error: 'done' has already been called. Please check your script for extraneous calls to 'done'.");
        }
        return;
      }
      _done = true;
      _promise = isPromise === true;

      if (info.httpOutputName && this.res && this.bindings[info.httpOutputName] === undefined) {
        this.bindings[info.httpOutputName] = this.res;
      }

      callback(err, {
        return: result,
        bindings: this.bindings
      });
    };
  }
}

function getLogger(invocationId: string, functionName: string, log: ILogCallback): ILogger{
    return Object.assign(
      <ILog>(...args: any[]) => log(LogLevel.Information, ...args),
      {
        error: <ILog>(...args: any[]) => log(LogLevel.Error, ...args),
        warn: <ILog>(...args: any[]) => log(LogLevel.Warning, ...args),
        info: <ILog>(...args: any[]) => log(LogLevel.Information, ...args),
        verbose: <ILog>(...args: any[]) => log(LogLevel.Trace, ...args)
      }
    );
}

function getNormalizedBindingData(request: rpc.InvocationRequest$Properties): IDict {
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
      // If the value is a JSON object, convert keys to camel case
      if (typeof value === 'object') {
          output[camelCasedKey] = convertKeysToCamelCase(value);
        } else {
          output[camelCasedKey] = value;
      }
  }
  return output;
}

export interface IInvocationResult {
  return: any;
  bindings: IDict;
}

export interface ILog {
  (...args: any[]): void;
}

export interface ILogger extends ILog {
  error: ILog;
  warn: ILog;
  info: ILog;
  verbose: ILog;
}

export interface ILogCallback {
  (level: LogLevel, ...args: any[]): void;
}

export interface IResultCallback {
  (err?: any, result?: IInvocationResult): void;
}

export interface IDoneCallback {
  (err?: any, result?: any): void;
}

export interface IExecutionContext {
  invocationId: string;
  functionName: string;
  functionDirectory: string;
}

export interface IDict {
  [key: string]: any
}

