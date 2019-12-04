import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { HttpMethod, Cookie } from '../public/Interfaces';
import { RequestProperties } from '../http/Request';
import { Dict } from '../Context';
import { InternalException } from '../utils/InternalException';
import { 
    fromTypedData,
    toTypedData,
    toRpcString,
    toNullableString,
    toNullableBool,
    toNullableDouble,
    toNullableTimestamp
} from './RpcConverters';

/**
 * Converts 'IRpcHttp' input from the RPC layer to a JavaScript object.
 * @param rpcHttp RPC layer representation of an HTTP request
 */
export function fromRpcHttp(rpcHttp: rpc.IRpcHttp): RequestProperties {
    const httpContext: RequestProperties = {
      method: <HttpMethod>rpcHttp.method,
      url: <string>rpcHttp.url,
      originalUrl: <string>rpcHttp.url,
      headers: <Dict<string>>rpcHttp.headers,
      query: <Dict<string>>rpcHttp.query,
      params: <Dict<string>>rpcHttp.params,
      body: fromTypedData(<rpc.ITypedData>rpcHttp.body),
      rawBody: fromRpcHttpBody(<rpc.ITypedData>rpcHttp.body),
    };
  
    return httpContext;
}

/**
 * Converts the provided body from the RPC layer to the appropriate javascript object.
 * Body of type 'byte' is a special case and it's converted to it's utf-8 string representation.
 * This is to avoid breaking changes in v2.
 * @param body The body from the RPC layer.
 */
function fromRpcHttpBody(body: rpc.ITypedData) {
    if (body && body.bytes) {
        return (<Buffer>body.bytes).toString();
    }
    else {
        return fromTypedData(body, false);
    }
}

/**
 * Converts the HTTP 'Response' object to an 'ITypedData' 'http' type to be sent through the RPC layer. 
 * 'http' types are a special case from other 'ITypedData' types, which come from primitive types. 
 * @param inputMessage  An HTTP response object
 */
export function toRpcHttp(inputMessage): rpc.ITypedData {
    // Check if we will fail to find any of these
    if (typeof inputMessage !== 'object' || Array.isArray(inputMessage)) {
        throw new Error("The HTTP response must be an 'object' type that can include properties such as 'body', 'status', and 'headers'. Learn more: https://go.microsoft.com/fwlink/?linkid=2112563");
    }

    let httpMessage: rpc.IRpcHttp = inputMessage;
    httpMessage.headers = toRpcHttpHeaders(inputMessage.headers);
    httpMessage.cookies = toRpcHttpCookieList(inputMessage.cookies || []);
    let status = inputMessage.statusCode || inputMessage.status;
    httpMessage.statusCode = status && status.toString();
    httpMessage.body = toTypedData(inputMessage.body);
    return { http: httpMessage };
}

/**
 * Convert HTTP headers to a string/string mapping.
 * @param inputHeaders 
 */
function toRpcHttpHeaders(inputHeaders: rpc.ITypedData) {
    let rpcHttpHeaders: {[key: string]: string} = {};
    for (let key in inputHeaders) {
        if (inputHeaders[key] != null) {
        rpcHttpHeaders[key] = inputHeaders[key].toString();
        }
    }
    return rpcHttpHeaders;
}

/**
 * Convert HTTP 'Cookie' array to an array of 'IRpcHttpCookie' objects to be sent through the RPC layer
 * @param inputCookies array of 'Cookie' objects representing options for the 'Set-Cookie' response header
 */
export function toRpcHttpCookieList(inputCookies: Cookie[]): rpc.IRpcHttpCookie[] {
    let rpcCookies: rpc.IRpcHttpCookie[] = [];
    inputCookies.forEach(cookie => {
        rpcCookies.push(toRpcHttpCookie(cookie));
    });

    return rpcCookies;
}

/**
 * From RFC specifications for 'Set-Cookie' response header: https://www.rfc-editor.org/rfc/rfc6265.txt
 * @param inputCookie 
 */
function toRpcHttpCookie(inputCookie: Cookie): rpc.IRpcHttpCookie {
    // Resolve SameSite enum, a one-off
    let rpcSameSite: rpc.RpcHttpCookie.SameSite = rpc.RpcHttpCookie.SameSite.None;
    if (inputCookie && inputCookie.sameSite) {
        if (inputCookie.sameSite.toLocaleLowerCase() === "lax") {
        rpcSameSite = rpc.RpcHttpCookie.SameSite.Lax;
        } else if (inputCookie.sameSite.toLocaleLowerCase() === "strict") {
        rpcSameSite = rpc.RpcHttpCookie.SameSite.Strict;
        }
    }

    const rpcCookie: rpc.IRpcHttpCookie = {
            name: inputCookie && toRpcString(inputCookie.name, "cookie.name"),
            value: inputCookie && toRpcString(inputCookie.value, "cookie.value"),
            domain: toNullableString(inputCookie && inputCookie.domain, "cookie.domain"),
            path: toNullableString(inputCookie && inputCookie.path, "cookie.path"),
            expires: toNullableTimestamp(inputCookie && inputCookie.expires, "cookie.expires"),
            secure: toNullableBool(inputCookie && inputCookie.secure, "cookie.secure"),
            httpOnly: toNullableBool(inputCookie && inputCookie.httpOnly, "cookie.httpOnly"),
            sameSite: rpcSameSite,
            maxAge: toNullableDouble(inputCookie && inputCookie.maxAge, "cookie.maxAge")
    };

    return rpcCookie;
}