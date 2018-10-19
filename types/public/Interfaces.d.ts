export interface IContext {
    invocationId: string;
    executionContext: IExecutionContext;
    bindings: IDict<any>;
    bindingData: IDict<any>;
    log: ILogger;
    req?: IRequest;
    res?: IResponse;
    done: IDoneCallback;
}
export interface IExecutionContext {
    invocationId: string;
    functionName: string;
    functionDirectory: string;
}
export interface IDict<T> {
    [key: string]: T;
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
export interface IRequest {
    method: string;
    url: string;
    originalUrl: string;
    headers?: {
        [key: string]: string;
    };
    query?: {
        [key: string]: string;
    };
    params?: {
        [key: string]: string;
    };
    body?: any;
    rawbody?: any;
    get(field: string): string | undefined;
}
export interface IResponse {
    statusCode?: string | number;
    headers: {
        [key: string]: any;
    };
    body?: any;
    get(field: string): any;
    set(field: string, val: any): IResponse;
    header(field: string, val: any): IResponse;
    status(statusCode: string | number): IResponse;
}
export interface IDoneCallback {
    (err?: any, result?: any): void;
}
