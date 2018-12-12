/**
 * Interface for your Azure Function code. This function must be exported (via module.exports or exports)
 * and will execute when triggered. It is recommended that you declare this function as async, which
 * implicitly returns a Promise.
 * @param context IContext object passed to your function from the Azure Functions runtime.
 * @param {any[]} args Optional array of input and trigger binding data. These binding data are passed to the
 * function in the same order that they are defined in function.json.
 * @returns Output bindings (optional).
 */
export interface AzureFunction {
    (context: Context, ...args: any[]): Promise<any> | void;
}
/**
 * The context object can be used for writing logs, reading data from bindings, setting outputs and using
 * the context.done callback when your exported function is synchronous. A context object is passed
 * to your function from the Azure Functions runtime on function invocation.
 */
export interface Context {
    /**
     * A unique GUID per function invocation.
     */
    invocationId: string;
    /**
     * Function execution metadata.
     */
    executionContext: ExecutionContext;
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
    bindingDefinitions: BindingDefinition[];
    /**
     * Calling directly allows you to write streaming function logs at the default trace level.
     */
    log: Logger;
    /**
     * A callback function that signals to the runtime that your code has completed. If your function is synchronous,
     * you must call context.done at the end of execution. If your function is asynchronous, you should not use this
     * callback.
     *
     * @param err A user-defined error to pass back to the runtime. If present, your function execution will fail.
     * @param result An object containing output binding data.
     */
    done: DoneCallback;
    /**
     * HTTP request object. Provided to your function when using HTTP Bindings.
     */
    req?: HttpRequest;
    /**
     * HTTP response object. Provided to your function when using HTTP Bindings.
     */
    res?: HttpResponse;
}
/**
 * HTTP request object. Provided to your function when using HTTP Bindings.
 */
export interface HttpRequest {
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
/**
 * HTTP response object.
 */
export interface HttpResponse {
    /**
     * The main content of the HTTP response.
     * @see isRaw
     */
    body?: any
    /**
     * The headers of the HTTP response.
     */
    headers?: {
        [key: string]: any
    }
    /**
     * Skip formatting the body.
     * @see body
     */
    isRaw?: boolean
    /**
     * The HTTP status code of the response. Default is `200` OK.
     */
    status?: number
}
export interface ExecutionContext {
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
export interface BindingDefinition {
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
export interface Log {
    (...args: any[]): void;
}
/**
 * Allows you to write streaming function logs.
 */
export interface Logger extends Log {
    /**
     * Writes to error level logging or lower.
     */
    error: Log;
    /**
     * Writes to warning level logging or lower.
     */
    warn: Log;
    /**
     * Writes to info level logging or lower.
     */
    info: Log;
    /**
     * Writes to verbose level logging.
     */
    verbose: Log;
}
export interface DoneCallback {
    (err?: any, result?: any): void;
}
