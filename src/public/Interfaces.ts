export interface IFunction {
    (context: IContext, ...args: any[]): void;
}

export interface IContext {
    invocationId: string;
    executionContext: IExecutionContext;
    bindings: { [key: string]: any };
    bindingData: { [key: string]: any };
    bindingDefinitions: IBindingDefinition[];
    log: ILogger;
    done: IDoneCallback;
}

export interface IHttpContext extends IContext {
    req: IRequest;
    res: { [key: string]: any };
}

export interface IRequest {
    method: string;
    url: string;
    originalUrl: string;
    headers: {[key:string]: string};
    query: {[key:string]: string};
    params: {[key:string]: string};
    body?: any;
    rawbody?: any;
    get(field: string): string | undefined;
}

export interface IExecutionContext {
    invocationId: string;
    functionName: string;
    functionDirectory: string;
}

export interface IBindingDefinition {
    name: string,
    type: string, 
    direction: string
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

export interface IDoneCallback {
    (err?: any, result?: any): void;
}