import { 
    AzureFunctionsRpcMessages as rpc,
    INullableString
} from '../../azure-functions-language-worker-protobuf/src/rpc';
import { HttpMethod, Cookie } from '../public/Interfaces';
import { RequestProperties } from '../http/Request';
import { Dict } from '../Context';
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
      headers: fromNullableMapping(rpcHttp.nullableHeaders, rpcHttp.headers),
      query: fromNullableMapping(rpcHttp.nullableQuery, rpcHttp.query),
      params: fromNullableMapping(rpcHttp.nullableParams, rpcHttp.params),
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

function fromNullableMapping(nullableMapping: { [k: string]: INullableString } | null | undefined, originalMapping?: { [k: string]: string } | null): Dict<string> {
    let converted = {};
    if (nullableMapping && Object.keys(nullableMapping).length > 0) {
        for (const key in nullableMapping) {
            converted[key] = nullableMapping[key].value || "";
        }
    } else if (originalMapping && Object.keys(originalMapping).length > 0) {
        converted = <Dict<string>>originalMapping;
    }
    return converted;
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
        let sameSite = inputCookie.sameSite.toLocaleLowerCase();
        if (sameSite === "lax") {
            rpcSameSite = rpc.RpcHttpCookie.SameSite.Lax;
        } else if (sameSite === "strict") {
            rpcSameSite = rpc.RpcHttpCookie.SameSite.Strict;
        } else if (sameSite === "none") {
            rpcSameSite = rpc.RpcHttpCookie.SameSite.ExplicitNone;
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