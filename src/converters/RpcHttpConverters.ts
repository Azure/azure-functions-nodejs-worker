import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { HttpMethod, Cookie } from '../public/Interfaces';
import { RequestProperties } from '../http/Request';
import { Dict } from '../Context';
import { fromTypedData, toTypedData, toNullable, toNullableTimestamp } from './CommonConverters';

export function fromRpcHttp(rpcHttp: rpc.IRpcHttp): RequestProperties {
    const httpContext: RequestProperties = {
      method: <HttpMethod>rpcHttp.method,
      url: <string>rpcHttp.url,
      originalUrl: <string>rpcHttp.url,
      headers: <Dict<string>>rpcHttp.headers,
      query: <Dict<string>>rpcHttp.query,
      params: <Dict<string>>rpcHttp.params,
      body: fromTypedData(<rpc.ITypedData>rpcHttp.body),
      rawBody: fromTypedData(<rpc.ITypedData>rpcHttp.rawBody, false),
    };
  
    return httpContext;
}

export function toRpcHttp(inputMessage): rpc.ITypedData {
    let httpMessage: rpc.IRpcHttp = inputMessage;
    httpMessage.headers = toRpcHttpHeaders(inputMessage.headers);
    httpMessage.cookies = toRpcHttpCookies(inputMessage.cookies || []);
    let status = inputMessage.statusCode || inputMessage.status;
    httpMessage.statusCode = status && status.toString();
    httpMessage.body = toTypedData(inputMessage.body);
    return { http: httpMessage };
}

function toRpcHttpHeaders(inputHeaders: rpc.ITypedData) {
    let rpcHttpHeaders: {[key: string]: string} = {};
    for (let key in inputHeaders) {
        if (inputHeaders[key] != null) {
        rpcHttpHeaders[key] = inputHeaders[key].toString();
        }
    }
    return rpcHttpHeaders;
    }

    function toRpcHttpCookies(inputCookies: Cookie[]): rpc.IRpcHttpCookie[] {
    let rpcCookies: rpc.IRpcHttpCookie[] = [];
    inputCookies.forEach(cookie => {
        rpcCookies.push(toRpcHttpCookie(cookie));
    });

    return rpcCookies;
}

function toRpcHttpCookie(inputCookie: Cookie): rpc.IRpcHttpCookie {
    // Resolve SameSite enum, a one-off
    let rpcSameSite: rpc.RpcHttpCookie.SameSite = rpc.RpcHttpCookie.SameSite.None;
    if (inputCookie.sameSite) {
        if (inputCookie.sameSite.toLocaleLowerCase() === "lax") {
        rpcSameSite = rpc.RpcHttpCookie.SameSite.Lax;
        } else if (inputCookie.sameSite.toLocaleLowerCase() === "strict") {
        rpcSameSite = rpc.RpcHttpCookie.SameSite.Strict;
        }
    }

    const rpcCookie: rpc.IRpcHttpCookie = {
            name: inputCookie.name,
            value: inputCookie.value,
            domain: toNullable<string>(inputCookie.domain),
            path: toNullable<string>(inputCookie.path),
            expires: toNullableTimestamp(inputCookie.expires),
            secure: toNullable<boolean>(inputCookie.secure),
            httpOnly: toNullable<boolean>(inputCookie.secure),
            sameSite: rpcSameSite,
            maxAge: toNullable<Long>(inputCookie.maxAge)
    };

    return rpcCookie;
}