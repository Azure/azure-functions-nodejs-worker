import { Duplex } from 'stream';
import { format, isFunction } from 'util';

import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import Status = rpc.StatusResult.Status;
import { IFunctionLoader } from './FunctionLoader';
import { CreateContextAndInputs, ILogCallback, IResultCallback } from './Context';
import { IEventStream } from './GrpcService';
import { toTypedData } from './Converters';

export class WorkerChannel {
  private _eventStream: IEventStream;
  private _functionLoader: IFunctionLoader;
  private _workerId: string;

  constructor(workerId: string, eventStream: IEventStream, functionLoader: IFunctionLoader) {
    this._workerId = workerId;
    this._eventStream = eventStream;
    this._functionLoader = functionLoader;

    // call the method with the matching 'event' name on this class, passing the requestId and event message
    eventStream.on('data', (msg) => {
      let event = <string>msg.content;
      let eventHandler = (<any>this)[event];
      if (eventHandler) {
        eventHandler.apply(this, [msg.requestId, msg[event]]);
      } else {
        console.error(`Worker ${workerId} had no handler for message '${event}'`)
      }
    });
    eventStream.on('error', function (err) {
      console.error(`Worker ${workerId} encountered event stream error: `, err);
      throw err;
    });

    // wrap event stream write to validate message correctness
    let oldWrite = eventStream.write;
    eventStream.write = function checkWrite(msg) {
        let msgError = rpc.StreamingMessage.verify(msg);
        if (msgError) {
          console.error(`Worker ${workerId} malformed message`, msgError);
          throw msgError;
        }
        oldWrite.apply(eventStream, arguments);
    }
  }

  private log(log: rpc.IRpcLog) {
    this._eventStream.write({
      rpcLog: log
    });
  }

  public workerInitRequest(requestId: string, msg: rpc.WorkerInitRequest) {
    this._eventStream.write({
      requestId: requestId,
      workerInitResponse: {
        result: {
          status: Status.Success
        }
      }
    });
  }

  public functionLoadRequest(requestId: string, msg: rpc.FunctionLoadRequest) {
    if (msg.functionId && msg.metadata) {
      let functionLoadStatus: rpc.IStatusResult = {
        status: Status.Success
      };

      try {
        this._functionLoader.load(msg.functionId, msg.metadata);
      }
      catch(exception) {
        let errorMessage = `Worker was unable to load function ${msg.metadata.name}: '${exception}'`;
        console.error(errorMessage)
        functionLoadStatus.status = Status.Failure;
        functionLoadStatus.exception =  {
          message: errorMessage,
          stackTrace: exception.stack
        };
      }

      this._eventStream.write({
        requestId: requestId,
        functionLoadResponse: {
          functionId: msg.functionId,
          result: functionLoadStatus
        }
      });
    }
  }

  public invocationRequest(requestId: string, msg: rpc.InvocationRequest) {
    let info = this._functionLoader.getInfo(<string>msg.functionId);
    let logCallback: ILogCallback = (level, ...args) => {
      this.log({
        invocationId: msg.invocationId,
        category: `${info.name}.Invocation`,
        message: format.apply(null, args),
        level: level
      });
    }

    let resultCallback: IResultCallback = (err, result) => {
      let status: rpc.IStatusResult = {
        status: rpc.StatusResult.Status.Success
      };
      if (err) {
        status.status = rpc.StatusResult.Status.Failure;
        status.exception = {
          message: err.toString(),
          stackTrace: err.stack
        }
      }

      let response: rpc.IInvocationResponse = {
        invocationId: msg.invocationId,
        result: status
      }
      if (result) {
        if (result.return) {
          response.returnValue = toTypedData(result.return);
        }
        if (result.bindings) {
          response.outputData = Object.keys(info.outputBindings)
            .filter(key => result.bindings[key] !== undefined)
            .map(key => <rpc.IParameterBinding>{
              name: key,
              data: info.outputBindings[key].converter(result.bindings[key])
            });
        }
      }

      this._eventStream.write({
        requestId: requestId,
        invocationResponse: response
      });
    }

    let { context, inputs } = CreateContextAndInputs(info, msg, logCallback, resultCallback);
    let userFunction = this._functionLoader.getFunc(<string>msg.functionId);
    
    // catch user errors from the same async context in the event loop and correlate with invocation
    // throws from asynchronous work (setTimeout, etc) are caught by 'unhandledException' and cannot be correlated with invocation
    try {
      let result = userFunction(context, ...inputs);

      if (result && isFunction(result.then)) {
        result.then(result => (<any>context.done)(null, result, true))
          .catch(err => context.done(err));
      }
    } catch (err) {
      resultCallback(err);
    }
  }
}
