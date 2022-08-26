// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as coreTypes from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../../../azure-functions-language-worker-protobuf/src/rpc';
import { ensureKeysMatch } from './ensureKeysMatch';
import { handleDefaultEnumCase } from './handleDefaultEnumCase';

export function toCoreTypedData(data: rpc.ITypedData | null | undefined): coreTypes.RpcTypedData | null | undefined {
    if (data) {
        const result = {
            ...data,
            http: toCoreHttpData(data.http),
        };
        return ensureKeysMatch(data, result);
    } else {
        return data;
    }
}

function toCoreHttpData(data: rpc.IRpcHttp | null | undefined): coreTypes.RpcHttpData | null | undefined {
    if (data) {
        const result = {
            ...data,
            cookies: toCoreHttpCookies(data.cookies),
            body: toCoreTypedData(data.body),
            rawBody: toCoreTypedData(data.rawBody),
        };
        return ensureKeysMatch(data, result);
    } else {
        return data;
    }
}

function toCoreHttpCookies(
    data: rpc.IRpcHttpCookie[] | null | undefined
): coreTypes.RpcHttpCookie[] | null | undefined {
    if (data) {
        return data.map(toCoreHttpCookie);
    } else {
        return data;
    }
}

function toCoreHttpCookie(data: rpc.IRpcHttpCookie): coreTypes.RpcHttpCookie {
    const result = {
        ...data,
        sameSite: toCoreHttpCookieSameSite(data.sameSite),
    };
    return ensureKeysMatch(data, result);
}

function toCoreHttpCookieSameSite(
    data: rpc.RpcHttpCookie.SameSite | null | undefined
): coreTypes.RpcHttpCookieSameSite | null | undefined {
    switch (data) {
        case rpc.RpcHttpCookie.SameSite.ExplicitNone:
            return 'explicitNone';
        case rpc.RpcHttpCookie.SameSite.Lax:
            return 'lax';
        case rpc.RpcHttpCookie.SameSite.None:
            return 'none';
        case rpc.RpcHttpCookie.SameSite.Strict:
            return 'strict';
        default:
            return handleDefaultEnumCase(data, 'RpcHttpCookieSameSite');
    }
}
