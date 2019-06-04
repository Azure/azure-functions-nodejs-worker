import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { HttpMethod, Cookie } from '../public/Interfaces';
import { RequestProperties } from '../http/Request';
import { Dict } from '../Context';
import { 
    fromTypedData,
    toTypedData,
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
      rawBody: fromTypedData(<rpc.ITypedData>rpcHttp.rawBody, false),
    };
  
    return httpContext;
}

/**
 * Converts the HTTP 'Response' object to an 'ITypedData' 'http' type to be sent through the RPC layer. 
 * 'http' types are a special case from other 'ITypedData' types, which come from primitive types. 
 * @param inputMessage  An HTTP response object
 */
export function toRpcHttp(inputMessage): rpc.ITypedData {
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
function toRpcHttpCookieList(inputCookies: Cookie[]): rpc.IRpcHttpCookie[] {
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
            domain: toNullableString(inputCookie.domain, "domain"),
            path: toNullableString(inputCookie.path, "path"),
            expires: toNullableTimestamp(inputCookie.expires, "expires"),
            secure: toNullableBool(inputCookie.secure, "secure"),
            httpOnly: toNullableBool(inputCookie.httpOnly, "httpOnly"),
            sameSite: rpcSameSite,
            maxAge: toNullableDouble(inputCookie.maxAge, "maxAge")
    };

    return rpcCookie;
}