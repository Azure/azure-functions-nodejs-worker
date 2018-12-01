/**
 * Interface for your Azure Function code. This function must be exported (via module.exports or exports)
 * and will execute when triggered. It is recommended that you declare this function as async, which will
 * implicitly returns a Promise.
 * @param context IContext object passed to your function from the Azure Functions runtime.
 * @param {any[]} args Optional array of input and trigger binding data. These binding data are passed to the
 * function in the same order that they are defined in function.json.
 * @returns Output bindings (optional).
 */
export interface IFunction {
    (context: IContext, ...args: any[]): Promise<any> | void;
}
/**
 * The context object can be used for writing logs, reading data from bindings, setting outputs and using
 * the context.done callback when your exported function is declared synchronous. A context object is passed
 * to your function from the Azure Functions runtime on function invocation.
 */
export interface IContext {
    /**
     * A unique GUID per function invocation.
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
    bindings: {
        [key: string]: any;
    };
    /**
     * Trigger metadata and function invocation data.
     */
    bindingData: {
        [key: string]: any;
    };
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
     * HTTP request object. Provided to your function when using HTTP Bindings.
     */
    req?: IRequest;
    /**
     * HTTP response object. Provided to your function when using HTTP Bindings.
     */
    res?: {
        [key: string]: any;
    };
}
/**
 * HTTP request object. Provided to your function when using HTTP Bindings.
 */
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
    headers: {
        [key: string]: string;
    };
    /**
     * Query string parameter keys and values from the URL.
     */
    query: {
        [key: string]: string;
    };
    /**
     * Route parameter keys and values.
     */
    params: {
        [key: string]: string;
    };
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
     * A unique GUID per function invocation.
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
    name: string;
    /**
     * The type of your binding, as defined in function.json.
     */
    type: string;
    /**
     * The direction of your binding ('in', 'out', or 'inout'), as defined in function.json.
     */
    direction: string;
}
export interface ILog {
    (...args: any[]): void;
}
/**
 * Allows you to write streaming function logs.
 */
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
