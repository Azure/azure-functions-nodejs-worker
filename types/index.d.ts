// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

declare module '@azure/functions' {
    /**
     * Interface for your Azure Function code. This function must be exported (via module.exports or exports)
     * and will execute when triggered. It is recommended that you declare this function as async, which
     * implicitly returns a Promise.
     * @param context Context object passed to your function from the Azure Functions runtime.
     * @param {any[]} args Optional array of input and trigger binding data. These binding data are passed to the
     * function in the same order that they are defined in function.json. Valid input types are string, HttpRequest,
     * and Buffer.
     * @returns Output bindings (optional). If you are returning a result from a Promise (or an async function), this
     * result will be passed to JSON.stringify unless it is a string, Buffer, ArrayBufferView, or number.
     */
    export type AzureFunction = (context: Context, ...args: any[]) => Promise<any> | void;

    /**
     * Context bindings object. Provided to your function binding data, as defined in function.json.
     */
    export interface ContextBindings {
        [name: string]: any;
    }
    /**
     * Context binding data. Provided to your function trigger metadata and function invocation data.
     */
    export interface ContextBindingData {
        /**
         * A unique GUID per function invocation.
         */
        invocationId: string;

        [name: string]: any;
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
        bindings: ContextBindings;
        /**
         * Trigger metadata and function invocation data.
         */
        bindingData: ContextBindingData;
        /**
         * TraceContext information to enable distributed tracing scenarios.
         */
        traceContext: TraceContext;
        /**
         * Bindings your function uses, as defined in function.json.
         */
        bindingDefinitions: BindingDefinition[];
        /**
         * Allows you to write streaming function logs. Calling directly allows you to write streaming function logs
         * at the default trace level.
         */
        log: Logger;
        /**
         * A callback function that signals to the runtime that your code has completed. If your function is synchronous,
         * you must call context.done at the end of execution. If your function is asynchronous, you should not use this
         * callback.
         *
         * @param err A user-defined error to pass back to the runtime. If present, your function execution will fail.
         * @param result An object containing output binding data. `result` will be passed to JSON.stringify unless it is
         *  a string, Buffer, ArrayBufferView, or number.
         */
        done(err?: Error | string | null, result?: any): void;
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
     * HTTP request headers.
     */
    export interface HttpRequestHeaders {
        [name: string]: string;
    }
    /**
     * HTTP response headers.
     */
    export interface HttpResponseHeaders {
        [name: string]: string;
    }
    /**
     * Query string parameter keys and values from the URL.
     */
    export interface HttpRequestQuery {
        [name: string]: string;
    }
    /**
     * Route parameter keys and values.
     */
    export interface HttpRequestParams {
        [name: string]: string;
    }
    /**
     *  Object representing logged-in user, either through
     *  AppService/Functions authentication, or SWA Authentication
     */
    export interface HttpRequestUser {
        /**
         * Type of authentication, either AppService or StaticWebApps
         */
        type: HttpRequestUserType;
        /**
         * unique user GUID
         */
        id: string;
        /**
         * unique username
         */
        username: string;
        /**
         * provider of authentication service
         */
        identityProvider: string;
        /**
         * Extra authentication information, dependent on auth type
         * and auth provider
         */
        claimsPrincipalData: {
            [key: string]: any;
        };
    }
    /**
     * HTTP request object. Provided to your function when using HTTP Bindings.
     */
    export interface HttpRequest {
        /**
         * HTTP request method used to invoke this function.
         */
        method: HttpMethod | null;
        /**
         * Request URL.
         */
        url: string;
        /**
         * HTTP request headers.
         */
        headers: HttpRequestHeaders;
        /**
         * Query string parameter keys and values from the URL.
         */
        query: HttpRequestQuery;
        /**
         * Route parameter keys and values.
         */
        params: HttpRequestParams;
        /**
         *  Object representing logged-in user, either through
         *  AppService/Functions authentication, or SWA Authentication
         *  null when no such user is logged in.
         */
        user: HttpRequestUser | null;
        /**
         * The HTTP request body.
         */
        body?: any;
        /**
         * The HTTP request body as a UTF-8 string.
         */
        rawBody?: any;
    }
    /**
     * Possible values for an HTTP request method.
     */
    export type HttpMethod = 'GET' | 'POST' | 'DELETE' | 'HEAD' | 'PATCH' | 'PUT' | 'OPTIONS' | 'TRACE' | 'CONNECT';
    /**
     * Possible values for an HTTP Request user type
     */
    export type HttpRequestUserType = 'AppService' | 'StaticWebApps';
    /**
     * HTTP response object
     */
    export interface HttpResponseBase {
        /**
         * HTTP response headers.
         */
        headers?: HttpResponseHeaders;
        /**
         *  HTTP response cookies.
         */
        cookies?: Cookie[];
        /**
         * HTTP response body.
         */
        body?: any;
        /**
         * HTTP response status code.
         * @default 200
         */
        statusCode?: number | string;
        /**
         * Enables content negotiation using ASP.NET core if true
         * If false, treat response as raw (default)
         * @default false
         */
        enableContentNegotiation?: boolean;
    }
    /**
     * Http response object and methods. Provided to your function when using HTTP triggers.
     */
    export interface HttpResponseApi extends HttpResponseBase {
        /**
         * Sets the HTTP response status code
         * @param statusCode the status code to set
         * @returns the updated HttpResponseApi instance
         */
        status: (statusCode: number | string) => HttpResponseApi;
        /**
         * Sets a particular header field to a value
         * @param field the name of the header field to set
         * @param val the value of the header field
         * @returns the updated HttpResponseApi instance
         */
        setHeader(field: string, val: any): HttpResponseApi;
        /**
         * Has the same functionality as setHeader.
         * Sets a particular header field to a value
         * @param field the name of the header field to set
         * @param val the value of the header field
         * @returns the updated HttpResponseApi instance
         */
        header(field: string, val: any): HttpResponseApi;
        /**
         * Has the same functionality as setHeader.
         * Sets a particular header field to a value
         * @param field the name of the header field to set
         * @param val the value of the header field
         * @returns the updated HttpResponseApi instance
         */
        set(field: string, val: any): HttpResponseApi;
        /**
         * Get the value of a particular header field
         * @param field the name of the header field to get
         */
        getHeader(field: string): any;
        /**
         * Has the same functionality as getHeader
         * Get the value of a particular header field
         * @param field the name of the header field to get
         */
        get(field: string): any;
        /**
         * Removes a particular header field
         * @param field the name of the header field to remove
         * @returns the updated HttpResponseApi instance
         */
        removeHeader(field: string): HttpResponseApi;
        /**
         * Set the 'Content-Type' header to a particular value
         * @param type the value to set header 'Content-Type' to
         * @returns the updated HttpResponseApi instance
         */
        type(type: string): HttpResponseApi;
        /**
         * Automatically sets the content-type then calls context.done()
         * @param body (optional) body content to send
         * @returns updated HttpResponseApi instance
         * @deprecated this method calls context.done() which is deprecated, use async/await and pass the response as the return value instead.
         * See the docs here for more information: https://aka.ms/functions-js-async-await
         */
        send(body?: any): HttpResponseApi;
        /**
         * Same as send()
         * Automatically sets the content-type then calls context.done()
         * @param body (optional) body content to send
         * @returns updated HttpResponseApi instance
         * @deprecated this method calls context.done() which is deprecated, use async/await and pass the response as your function's return value instead.
         * See the docs here for more information: https://aka.ms/functions-js-async-await
         */
        end(body?: any): HttpResponseApi;
        /**
         * Sets the status code then calls send()
         * @param statusCode status code to send
         * @returns updated HttpResponseApi instance
         * @deprecated this method calls context.done() which is deprecated, use async/await and pass the response as your function's return value instead.
         * See the docs here for more information: https://aka.ms/functions-js-async-await
         */
        sendStatus(statusCode: string | number): HttpResponseApi;
        /**
         * Sets the 'Content-Type' header to 'application/json' then calls send(body)
         * @param body (optional) body content to send
         * @deprecated this method calls context.done() which is deprecated, use async/await and pass the response as your function's return value instead.
         * See the docs here for more information: https://aka.ms/functions-js-async-await
         */
        json(body?: any): void;
    }
    /**
     * Http response object. Set by your function when using HTTP triggers.
     */
    export interface HttpResponseObject extends HttpResponseBase {
        /**
         * HTTP response status code
         * @default 200
         */
        status?: number | string;
    }
    /**
     * Http response type.
     */
    export type HttpResponse = HttpResponseObject | HttpResponseApi;

    /**
     * Http response cookie object to "Set-Cookie"
     */
    export interface Cookie {
        /** Cookie name */
        name: string;
        /** Cookie value */
        value: string;
        /** Specifies allowed hosts to receive the cookie */
        domain?: string;
        /** Specifies URL path that must exist in the requested URL */
        path?: string;
        /**
         * NOTE: It is generally recommended that you use maxAge over expires.
         * Sets the cookie to expire at a specific date instead of when the client closes.
         * This can be a Javascript Date or Unix time in milliseconds.
         */
        expires?: Date | number;
        /** Sets the cookie to only be sent with an encrypted request */
        secure?: boolean;
        /** Sets the cookie to be inaccessible to JavaScript's Document.cookie API */
        httpOnly?: boolean;
        /** Can restrict the cookie to not be sent with cross-site requests */
        sameSite?: 'Strict' | 'Lax' | 'None' | undefined;
        /** Number of seconds until the cookie expires. A zero or negative number will expire the cookie immediately. */
        maxAge?: number;
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
        /**
         * The retry context of the current function execution or null if the retry policy is not defined.
         */
        retryContext: RetryContext | null;
    }
    export interface RetryContext {
        /**
         * Current retry count of the function executions.
         */
        retryCount: number;
        /**
         * Max retry count is the maximum number of times an execution is retried before eventual failure. A value of -1 means to retry indefinitely.
         */
        maxRetryCount: number;
        /**
         * Exception that caused the retry
         */
        exception?: Exception;
    }
    export interface Exception {
        /** Exception source */
        source?: string | null;
        /** Exception stackTrace */
        stackTrace?: string | null;
        /** Exception message */
        message?: string | null;
    }
    /**
     * TraceContext information to enable distributed tracing scenarios.
     */
    export interface TraceContext {
        /** Describes the position of the incoming request in its trace graph in a portable, fixed-length format. */
        traceparent: string | null | undefined;
        /** Extends traceparent with vendor-specific data. */
        tracestate: string | null | undefined;
        /** Holds additional properties being sent as part of request telemetry. */
        attributes:
            | {
                  [k: string]: string;
              }
            | null
            | undefined;
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
         * The direction of your binding, as defined in function.json.
         */
        direction: 'in' | 'out' | 'inout' | undefined;
    }
    /**
     * Allows you to write streaming function logs.
     */
    export interface Logger {
        /**
         * Writes streaming function logs at the default trace level.
         */
        (...args: any[]): void;
        /**
         * Writes to error level logging or lower.
         */
        error(...args: any[]): void;
        /**
         * Writes to warning level logging or lower.
         */
        warn(...args: any[]): void;
        /**
         * Writes to info level logging or lower.
         */
        info(...args: any[]): void;
        /**
         * Writes to verbose level logging.
         */
        verbose(...args: any[]): void;
    }
    /**
     * Timer schedule information. Provided to your function when using a timer binding.
     */
    export interface Timer {
        /**
         * Whether this timer invocation is due to a missed schedule occurrence.
         */
        isPastDue: boolean;
        schedule: {
            /**
             * Whether intervals between invocations should account for DST.
             */
            adjustForDST: boolean;
        };
        scheduleStatus: {
            /**
             * The last recorded schedule occurrence. Date ISO string.
             */
            last: string;
            /**
             * The expected next schedule occurrence. Date ISO string.
             */
            next: string;
            /**
             * The last time this record was updated. This is used to re-calculate `next` with the current schedule after a host restart. Date ISO string.
             */
            lastUpdated: string;
        };
    }
}
