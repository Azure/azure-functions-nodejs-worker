import { format, isFunction } from 'util';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { IFunctionLoader } from './FunctionLoader';
import { CreateContextAndInputs, LogCallback, ResultCallback } from './Context';
import { IEventStream } from './GrpcService';
import { toTypedData } from './converters';
import { augmentTriggerMetadata } from './augmenters';
import { systemError } from './utils/Logger';
import { InternalException } from './utils/InternalException';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

/**
 * The worker channel should have a way to handle all incoming gRPC messages.
 * This includes all incoming StreamingMessage types (exclude *Response types and RpcLog type)
 */
interface IWorkerChannel {
  startStream(requestId: string, msg: rpc.StartStream): void;
  workerInitRequest(requestId: string, msg: rpc.WorkerInitRequest): void;
  workerHeartbeat(requestId: string, msg: rpc.WorkerHeartbeat): void;
  workerTerminate(requestId: string, msg: rpc.WorkerTerminate): void;
  workerStatusRequest(requestId: string, msg: rpc.WorkerStatusRequest): void;
  fileChangeEventRequest(requestId: string, msg: rpc.FileChangeEventRequest): void;
  functionLoadRequest(requestId: string, msg: rpc.FunctionLoadRequest): void;
  invocationRequest(requestId: string, msg: rpc.InvocationRequest): void;
  invocationCancel(requestId: string, msg: rpc.InvocationCancel): void;
  functionEnvironmentReloadRequest(requestId: string, msg: rpc.IFunctionEnvironmentReloadRequest): void;
}

/**
 * Initializes handlers for incoming gRPC messages on the client
 */
export class WorkerChannel implements IWorkerChannel {
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
        this.log({
          message: `Worker ${workerId} had no handler for message '${event}'`,
          level: LogLevel.Error,
          logCategory: LogCategory.System
        });
      }
    });
    eventStream.on('error', function (err) {
      systemError(`Worker ${workerId} encountered event stream error: `, err);
      throw new InternalException(err);
    });

    // wrap event stream write to validate message correctness
    let oldWrite = eventStream.write;
    eventStream.write = function checkWrite(msg) {
        let msgError = rpc.StreamingMessage.verify(msg);
        if (msgError) {
          systemError(`Worker ${workerId} malformed message`, msgError);
          throw new InternalException(msgError);
        }
        oldWrite.apply(eventStream, arguments);
    }
  }

  /**
   * Captured logs or relevant details can use the logs property 
   * @param requestId gRPC message request id
   * @param msg gRPC message content
   */
  private log(log: rpc.IRpcLog) {
    this._eventStream.write({
      rpcLog: log
    });
  }

  /**
   * Host sends capabilities/init data to worker and requests the worker to initialize itself 
   * @param requestId gRPC message request id
   * @param msg gRPC message content
   */
  public workerInitRequest(requestId: string, msg: rpc.WorkerInitRequest) {
    const capabilitiesDictionary = {
      RpcHttpTriggerMetadataRemoved: "true",
      RpcHttpBodyOnly: "true",
      IgnoreEmptyValuedRpcHttpHeaders: "true",
      WorkerStatus: "true"
    };
    this._eventStream.write({
      requestId: requestId,
      workerInitResponse: {
        result: this.getStatus(),
        capabilities : capabilitiesDictionary,
      }
    });
  }

  /**
   * Worker responds after loading required metadata to load function with the load result
   * @param requestId gRPC message request id
   * @param msg gRPC message content
   */
  public functionLoadRequest(requestId: string, msg: rpc.FunctionLoadRequest) {
    if (msg.functionId && msg.metadata) {
      let err, errorMessage;
      try {
        this._functionLoader.load(msg.functionId, msg.metadata);
      }
      catch(exception) {
        errorMessage = `Worker was unable to load function ${msg.metadata.name}: '${exception}'`;
        this.log({
          message: errorMessage,
          level: LogLevel.Error,
          logCategory: LogCategory.System
        });
        err = exception;
      }

      this._eventStream.write({
        requestId: requestId,
        functionLoadResponse: {
          functionId: msg.functionId,
          result: this.getStatus(err, errorMessage)
        }
      });
    }
  }

  /**
   * Host requests worker to invoke a Function
   * @param requestId gRPC message request id
   * @param msg gRPC message content
   */
  public invocationRequest(requestId: string, msg: rpc.InvocationRequest) {
    // Repopulate triggerMetaData if http.
    augmentTriggerMetadata(msg);

    let info = this._functionLoader.getInfo(<string>msg.functionId);
    let logCallback: LogCallback = (level, category, ...args) => {
      this.log({
        invocationId: msg.invocationId,
        category: `${info.name}.Invocation`,
        message: format.apply(null, args),
        level: level,
        logCategory: category
      });
    }

    let resultCallback: ResultCallback = (err, result) => {
      let response: rpc.IInvocationResponse = {
        invocationId: msg.invocationId,
        result: this.getStatus(err)
      }

      try {
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
      } catch (e) {
        response.result = this.getStatus(e)
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
          .catch(err => (<any>context.done)(err, null, true));
      }
    } catch (err) {
      resultCallback(err);
    }
  }

  /**
   * Worker sends the host information identifying itself
   */ 
  public startStream(requestId: string, msg: rpc.StartStream): void {
    // Not yet implemented
  }

  /**
   * Message is empty by design - Will add more fields in future if needed
   */ 
  public workerHeartbeat(requestId: string, msg: rpc.WorkerHeartbeat): void {
    // Not yet implemented
  }

  /**
   * Warning before killing the process after grace_period
   * Worker self terminates ..no response on this
   */ 
  public workerTerminate(requestId: string, msg: rpc.WorkerTerminate): void {
    // Not yet implemented
  }

  /**
   * When host sends a "WorkerStatusRequest," the worker needs to return the appropriate response.
   * The latency from request to response helps inform scale decisions.
   */ 
  public workerStatusRequest(requestId: string, msg: rpc.WorkerStatusRequest): void {
    this._eventStream.write({
      requestId: requestId,
      workerStatusResponse: {}
    });
  }

  /**
   * Host notifies worker of file content change
   */   
  public fileChangeEventRequest(requestId: string, msg: rpc.FileChangeEventRequest): void {
    // Not yet implemented
  }

  /**
   * Host requests worker to cancel invocation
   */ 
  public invocationCancel(requestId: string, msg: rpc.InvocationCancel): void {
    // Not yet implemented
  }
  
  /**
   * Environment variables from the current process
   */ 
  public functionEnvironmentReloadRequest(requestId: string, msg: rpc.IFunctionEnvironmentReloadRequest): void {
    // Add environment variables from incoming
    let numVariables = (msg.environmentVariables && Object.keys(msg.environmentVariables).length) || 0;
    this.log({
      message: `Reloading environment variables. Found ${numVariables} variables to reload.`,
      level: LogLevel.Information,
      logCategory: LogCategory.System
    });

    let error = null;
    try {
      process.env = Object.assign({}, msg.environmentVariables);
      // Change current working directory
      if (msg.functionAppDirectory)
      {
        this.log({
          message: `Changing current working directory to ${msg.functionAppDirectory}`,
          level: LogLevel.Information,
          logCategory: LogCategory.System
        });
        process.chdir(msg.functionAppDirectory);
      }
    } catch (e)
    {
      error = e;
    }

    let functionEnvironmentReloadResponse: rpc.IFunctionEnvironmentReloadResponse = {
      result: this.getStatus(error)
    };

    this._eventStream.write({
      requestId: requestId,
      functionEnvironmentReloadResponse
    });
  }

  private getStatus(err?: any, errorMessage?: string): rpc.IStatusResult{
    let status: rpc.IStatusResult = {
      status: rpc.StatusResult.Status.Success
    };

    if (err) {
      status.status = rpc.StatusResult.Status.Failure;
      status.exception = {
        message: errorMessage || err.toString(),
        stackTrace: err.stack
      }
    }

    return status;
  }
}