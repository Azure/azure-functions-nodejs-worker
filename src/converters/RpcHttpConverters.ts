// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { Cookie } from '@azure/functions';
import { RpcHttpCookie, RpcHttpData, RpcNullableString, RpcTypedData } from '@azure/functions-core';
import { Dict } from '../Context';
import {
    fromTypedData,
    toNullableBool,
    toNullableDouble,
    toNullableString,
    toNullableTimestamp,
    toRpcString,
    toTypedData,
} from './RpcConverters';

/**
 * Converts the provided body from the RPC layer to the appropriate javascript object.
 * Body of type 'byte' is a special case and it's converted to it's utf-8 string representation.
 * This is to avoid breaking changes in v2.
 * @param body The body from the RPC layer.
 */
export function fromRpcHttpBody(body: RpcTypedData) {
    if (body && body.bytes) {
        return (<Buffer>body.bytes).toString();
    } else {
        return fromTypedData(body, false);
    }
}

export function fromNullableMapping(
    nullableMapping: { [k: string]: RpcNullableString } | null | undefined,
    originalMapping?: { [k: string]: string } | null
): Dict<string> {
    let converted = {};
    if (nullableMapping && Object.keys(nullableMapping).length > 0) {
        for (const key in nullableMapping) {
            converted[key] = nullableMapping[key].value || '';
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
export function toRpcHttp(inputMessage): RpcTypedData {
    // Check if we will fail to find any of these
    if (typeof inputMessage !== 'object' || Array.isArray(inputMessage)) {
        throw new Error(
            "The HTTP response must be an 'object' type that can include properties such as 'body', 'status', and 'headers'. Learn more: https://go.microsoft.com/fwlink/?linkid=2112563"
        );
    }

    const httpMessage: RpcHttpData = inputMessage;
    httpMessage.headers = toRpcHttpHeaders(inputMessage.headers);
    httpMessage.cookies = toRpcHttpCookieList(inputMessage.cookies || []);
    let status = inputMessage.statusCode;
    if (typeof inputMessage.status !== 'function') {
        status ||= inputMessage.status;
    }
    httpMessage.statusCode = status && status.toString();
    httpMessage.body = toTypedData(inputMessage.body);
    return { http: httpMessage };
}

/**
 * Convert HTTP headers to a string/string mapping.
 * @param inputHeaders
 */
function toRpcHttpHeaders(inputHeaders: RpcTypedData) {
    const rpcHttpHeaders: { [key: string]: string } = {};
    for (const key in inputHeaders) {
        if (inputHeaders[key] != null) {
            rpcHttpHeaders[key] = inputHeaders[key].toString();
        }
    }
    return rpcHttpHeaders;
}

/**
 * Convert HTTP 'Cookie' array to an array of 'RpcHttpCookie' objects to be sent through the RPC layer
 * @param inputCookies array of 'Cookie' objects representing options for the 'Set-Cookie' response header
 */
export function toRpcHttpCookieList(inputCookies: Cookie[]): RpcHttpCookie[] {
    const rpcCookies: RpcHttpCookie[] = [];
    inputCookies.forEach((cookie) => {
        rpcCookies.push(toRpcHttpCookie(cookie));
    });

    return rpcCookies;
}

/**
 * From RFC specifications for 'Set-Cookie' response header: https://www.rfc-editor.org/rfc/rfc6265.txt
 * @param inputCookie
 */
function toRpcHttpCookie(inputCookie: Cookie): RpcHttpCookie {
    // Resolve RpcHttpCookie.SameSite enum, a one-off
    let rpcSameSite: RpcHttpCookie.SameSite = RpcHttpCookie.SameSite.None;
    if (inputCookie && inputCookie.sameSite) {
        const sameSite = inputCookie.sameSite.toLocaleLowerCase();
        if (sameSite === 'lax') {
            rpcSameSite = RpcHttpCookie.SameSite.Lax;
        } else if (sameSite === 'strict') {
            rpcSameSite = RpcHttpCookie.SameSite.Strict;
        } else if (sameSite === 'none') {
            rpcSameSite = RpcHttpCookie.SameSite.ExplicitNone;
        }
    }

    const rpcCookie: RpcHttpCookie = {
        name: inputCookie && toRpcString(inputCookie.name, 'cookie.name'),
        value: inputCookie && toRpcString(inputCookie.value, 'cookie.value'),
        domain: toNullableString(inputCookie && inputCookie.domain, 'cookie.domain'),
        path: toNullableString(inputCookie && inputCookie.path, 'cookie.path'),
        expires: toNullableTimestamp(inputCookie && inputCookie.expires, 'cookie.expires'),
        secure: toNullableBool(inputCookie && inputCookie.secure, 'cookie.secure'),
        httpOnly: toNullableBool(inputCookie && inputCookie.httpOnly, 'cookie.httpOnly'),
        sameSite: rpcSameSite,
        maxAge: toNullableDouble(inputCookie && inputCookie.maxAge, 'cookie.maxAge'),
    };

    return rpcCookie;
}
