/**
 * The Azure Function that is exported (via module.exports or exports). This is the function that will 
 * execute when triggered. It is recommended that you declare this as an async function that implicitly
 * returns a Promise.
 * @param context An IContext object passed to your function from the Azure Function runtime.
 * @returns Any output bindings or nothing.
 */
export interface IFunction {
    (context: IContext, ...args: any[]): Promise<any> | void;
}

/**
 * The context object can be used for reading and setting data from bindings, writing logs, and using the 
 * context.done callback when your exported function is declared synchronous. A context object is passed 
 * to your function from the Azure Function runtime on function invocation.
 */
export interface IContext {
    /**
     * A unique GUID per function invocation and execution.
     */
    invocationId: string;
    /**
     * Function execution metadata.
     */
    executionContext: IExecutionContext;
    /**
     * Input and trigger binding data, as defined in function.json. Properties on this object are dynamically 
     * generated and named based off of the "name" property in function.json.
     */
    bindings: { [key: string]: any };
    /**
     * Trigger metadata and function invocation data.
     */
    bindingData: { [key: string]: any };
    /**
     * Bindings your function uses, as defined in function.json.
     */
    bindingDefinitions: IBindingDefinition[];
    /**
     * Calling directly allows you to write streaming function logs at the default trace level. 
     */
    log: ILogger;
    /**
     * A callback function that signals to the runtime that your code has completed. If your function is synchronous,
     * you must call context.done at the end of execution. If your function is asynchronous, you should not use this 
     * callback.
     * 
     * @param err A user-defined error to pass back to the runtime. If present, your function execution will fail.
     * @param result An object containing output binding data.
     */
    done: IDoneCallback;
    /**
     * Properties of the HTTP request that was made to invoke this function. This property will be defined if you are
     * using HTTP bindings.
     */
    req?: IRequest;
    /**
     * HTTP response object to return. This property is used with HTTP bindings.
     */
    res?: { [key: string]: any };
}

export interface IRequest {
    /**
     * HTTP request method used to invoke this function.
     */
    method: string;
    /**
     * Request URL.
     */
    url: string;
    /**
     * HTTP request headers.
     */
    headers: {[key:string]: string};
    /**
     * Query string parameter keys and values from the URL.
     */
    query: {[key:string]: string};
    /**
     * Route parameter keys and values.
     */
    params: {[key:string]: string};
    /**
     * The HTTP request body
     */
    body?: any;
    /**
     * The HTTP request body as a UTF-8 string
     */
    rawbody?: any;
}

export interface IExecutionContext {
    /**
     * A unique GUID per function invocation and execution.
     */
    invocationId: string;
    /**
     * The name of the function that is being invoked. The name of your function is always the same as the
     * name of the corresponding function.json's parent directory. 
     */
    functionName: string;
    /**
     * The directory your function is in (this is the parent directory of this function's function.json).
     */
    functionDirectory: string;
}

export interface IBindingDefinition {
    /**
     * The name of your binding, as defined in function.json.
     */
    name: string,
    /**
     * The type of your binding, as defined in function.json.
     */
    type: string, 
    /**
     * The direction of your binding ('in' or 'out'), as defined in function.json.
     */
    direction: string
}

export interface ILog {
    (...args: any[]): void;
}
  
export interface ILogger extends ILog {
    /**
     * Writes to error level logging or lower.
     */
    error: ILog;
    /**
     * Writes to warning level logging or lower.
     */
    warn: ILog;
    /**
     * Writes to info level logging or lower.
     */
    info: ILog;
    /**
     * Writes to verbose level logging.
     */
    verbose: ILog;
}

export interface IDoneCallback {
    (err?: any, result?: any): void;
}