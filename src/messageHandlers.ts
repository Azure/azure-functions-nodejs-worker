import * as util from 'util';
import * as converters from './messageConverters';
import { FunctionRpc as rpc } from '../protos/rpc';
import { EventStream } from './rpcService';
import { getEntryPoint } from '../azurefunctions/functions';
import { Response } from '../azurefunctions/http/response';
import { Request } from '../azurefunctions/http/request';
import LogLevel = rpc.RpcLog.Level;

export interface Log {
  (...args: any[]): void;
}

export interface Logger extends Log {
  error: Log;
  warn: Log;
  info: Log;
  verbose: Log;
}

interface LogInternal {
  (invocationId: string, functionName: string, level: LogLevel, ...args: any[]): void;
}

interface ExecutionContext {
  invocationId: string;
  functionName: string;
  functionDirectory: string;
}

interface Dict {
  [key: string]: any
}

export class Context {
  private _done?: boolean;
  private _promise?: boolean;
  private _logInternal: LogInternal;
  private _callback: Function;
  invocationId: string;
  executionContext: ExecutionContext
  bindings: Dict;
  bindingData: Dict;
  log: Logger;
  req?: Request;
  res?: Response;

  constructor(callback: Function, log: LogInternal, executionContext: ExecutionContext, bindingData: Dict, bindings: Dict) {
    this._callback = callback;
    this._logInternal = log;
    this.invocationId = executionContext.invocationId;
    this.executionContext = executionContext;
    this.log = Object.assign(
      <Log>(...args: any[]) => this._log(LogLevel.Information, ...args),
      {
        error: <Log>(...args: any[]) => this._log(LogLevel.Error, ...args),
        warn: <Log>(...args: any[]) => this._log(LogLevel.Warning, ...args),
        info: <Log>(...args: any[]) => this._log(LogLevel.Information, ...args),
        verbose: <Log>(...args: any[]) => this._log(LogLevel.Trace, ...args)
      }
    );
    this.bindingData = bindingData;
    this.bindings = bindings;
  }

  private _log(level: LogLevel, ...msg: any[]) {
    this._logInternal(this.invocationId, this.executionContext.functionName, level, ...msg);
  }

  done(err?: any, result?: any) {
    if (this._done) {
      if (this._promise) {
        this.log.error("Error: Choose either to return a promise or call 'done'.  Do not use both in your script.");
      } else {
        this.log.error("Error: 'done' has already been called. Please check your script for extraneous calls to 'done'.");
      }
      return;
    }
    this._done = true;

    if (this.res && this.bindings.res === undefined) {
      this.bindings.res = this.res;
    }
    this._callback(err, result);
  }
}

export function invokeRequest(invocationRequest: rpc.InvocationRequest, call: EventStream, requestId, functionMetadata: rpc.RpcFunctionMetadata$Properties) {
  // TODO handle updating non-existing function_id
  if (!invocationRequest.functionId || !invocationRequest.triggerMetadata) {
    throw new Error("Invalid invocation");
  }

  let scriptFilePath = <string>functionMetadata.scriptFile;

  let triggerMetadata = invocationRequest.triggerMetadata || {};
  let bindingData: Dict = {};
  for (let key in triggerMetadata) {
    bindingData[key] = converters.fromTypedData(triggerMetadata[key]);
  }

  let bindings: Dict = {};
  let inputs: any[] = [];
  let httpInput: any;
  for (let binding of invocationRequest.inputData || []) {
    if (binding.data && binding.name) {
      let input: any;
      if (binding.data.http) {
        input = converters.fromRpcHttp(binding.data.http);
        httpInput = input;
      } else {
        input = converters.fromTypedData(binding.data);
      }
      bindings[binding.name] = input;
      inputs.push(input);
    }
  }

  var resultCallback = function (err, result) {
    let status: rpc.StatusResult$Properties = {
      status: rpc.StatusResult.Status.Success
    };

    if (err) {
      status.status = rpc.StatusResult.Status.Failure;
      status.exception = {
        message: err.toString(),
        stackTrace: err.stack
      };
    } else if (result) {
      context.bindings.$return = result;
      status.result = result.toString();
    }

    let response: rpc.InvocationResponse$Properties = {
      invocationId: invocationRequest.invocationId,
      result: status,
      outputData: Object.keys(context.bindings)
        .map(key => {
        let data: rpc.TypedData$Properties;
        if (key == 'res' && context.bindings[key].body) {
          data = {
            http: converters.toRpcHttp(context.bindings[key])
          };
        } else {
          data = converters.toTypedData(context.bindings[key]);
        }
        return <rpc.ParameterBinding$Properties>{
          name: key,
          data: data
        }
      })
    };

    call.write({
      requestId: requestId,
      invocationResponse: response
    });
  };

  let log = function (id: string, name: string, level: LogLevel, ...msg: any[]) {
    call.write({
      rpcLog: {
        invocationId: id,
        category: `${name}.Invocation`,
        message: util.format.apply(null, msg),
        level: level
      }
    });
  }

  let executionContext: ExecutionContext = {
    invocationId: <string>invocationRequest.invocationId,
    functionName: <string>functionMetadata.name,
    functionDirectory: <string>functionMetadata.directory
  };

  let context = new Context(resultCallback, log, executionContext, bindingData, bindings);
  if (httpInput) {
    context.req = new Request(httpInput);
    context.res = new Response((err, res) => context.done(err, res));
  }

  let script = require(scriptFilePath);
  let userFunction = getEntryPoint(script, functionMetadata.entryPoint);

  let result = userFunction(context, ...inputs);
  if (result && util.isFunction(result.then)) {
    (<any>context)._promise = true;
    result.then(result => context.done(null, result))
      .catch(err => context.done(err));
  }
}
