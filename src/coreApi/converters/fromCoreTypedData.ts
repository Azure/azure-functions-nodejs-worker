// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as coreTypes from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../../../azure-functions-language-worker-protobuf/src/rpc';
import { ensureKeysMatch } from './ensureKeysMatch';
import { handleDefaultEnumCase } from './handleDefaultEnumCase';

export function fromCoreTypedData(data: coreTypes.RpcTypedData | null | undefined): rpc.ITypedData | null | undefined {
    if (data) {
        const result = {
            ...data,
            http: fromCoreHttpData(data.http),
        };
        return ensureKeysMatch(data, result);
    } else {
        return data;
    }
}

function fromCoreHttpData(data: coreTypes.RpcHttpData | null | undefined): rpc.IRpcHttp | null | undefined {
    if (data) {
        const result = {
            ...data,
            body: fromCoreTypedData(data.body),
            cookies: fromCoreHttpCookies(data.cookies),
            rawBody: fromCoreTypedData(data.rawBody),
        };
        return ensureKeysMatch(data, result);
    } else {
        return data;
    }
}

function fromCoreHttpCookies(
    data: coreTypes.RpcHttpCookie[] | null | undefined
): rpc.IRpcHttpCookie[] | null | undefined {
    if (data) {
        return data.map(fromCoreHttpCookie);
    } else {
        return data;
    }
}

function fromCoreHttpCookie(data: coreTypes.RpcHttpCookie): rpc.IRpcHttpCookie {
    const result = {
        ...data,
        sameSite: fromCoreHttpCookieSameSite(data.sameSite),
    };
    return ensureKeysMatch(data, result);
}

function fromCoreHttpCookieSameSite(
    data: coreTypes.RpcHttpCookieSameSite | null | undefined
): rpc.RpcHttpCookie.SameSite | null | undefined {
    switch (data) {
        case 'explicitNone':
            return rpc.RpcHttpCookie.SameSite.ExplicitNone;
        case 'lax':
            return rpc.RpcHttpCookie.SameSite.Lax;
        case 'none':
            return rpc.RpcHttpCookie.SameSite.None;
        case 'strict':
            return rpc.RpcHttpCookie.SameSite.Strict;
        default:
            return handleDefaultEnumCase(data, 'CoreRpcHttpCookieSameSite');
    }
}
