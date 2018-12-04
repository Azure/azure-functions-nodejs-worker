import { FunctionInfo } from './FunctionInfo';
import { fromRpcHttp, fromTypedData, getNormalizedBindingData, getBindingDefinitions } from './Converters';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { Request, HttpRequest } from './http/Request';
import { Response } from './http/Response';
import LogLevel = rpc.RpcLog.Level;
import { IContext, IExecutionContext, ILogger, IDoneCallback, IBindingDefinition } from './public/Interfaces' 

export function CreateContextAndInputs(info: FunctionInfo, request: rpc.IInvocationRequest, logCallback: ILogCallback, callback: IResultCallback) {
  let context = new Context(info, request, logCallback, callback);

  let bindings: IDict<any> = {};
  let inputs: any[] = [];
  let httpInput: HttpRequest | undefined;
  for (let binding of <rpc.IParameterBinding[]>request.inputData) {
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
  bindings: IDict<any>;
  bindingData: IDict<any>;
  bindingDefinitions: IBindingDefinition[];
  log: ILogger;
  req?: Request;
  res?: Response;
  done: IDoneCallback;

  constructor(info: FunctionInfo, request: rpc.IInvocationRequest, logCallback: ILogCallback, callback: IResultCallback) {
    this.invocationId = <string>request.invocationId;
    this.executionContext = {
      invocationId: this.invocationId,
      functionName: <string>info.name,
      functionDirectory: <string>info.directory
    };
    this.bindings = {};

    this.log = getLogger(this.invocationId, this.executionContext.functionName, logCallback);
    this.bindingData = getNormalizedBindingData(request);
    this.bindingDefinitions = getBindingDefinitions(info);

    let _done = false;
    let _promise = false;
    // isPromise is a hidden parameter that we set to true in the event of a returned promise
    this.done = (err?: any, result?: any, isPromise?: boolean) => {
      _promise = isPromise === true;
      if (_done) {
        if (_promise) {
          this.log.error("Error: Choose either to return a promise or call 'done'.  Do not use both in your script.");
        } else {
          this.log.error("Error: 'done' has already been called. Please check your script for extraneous calls to 'done'.");
        }
        return;
      }
      _done = true;

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

export interface IInvocationResult {
  return: any;
  bindings: IDict<any>;
}

export interface ILogCallback {
  (level: LogLevel, ...args: any[]): void;
}

export interface IResultCallback {
  (err?: any, result?: IInvocationResult): void;
}

export interface IDict<T> {
  [key: string]: T
}