// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as coreTypes from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../../../azure-functions-language-worker-protobuf/src/rpc';
import { ensureKeysMatch } from './ensureKeysMatch';
import { handleDefaultEnumCase } from './handleDefaultEnumCase';
import { toCoreStatusResult } from './toCoreStatusResult';

export function toCoreFunctionMetadata(data: rpc.IRpcFunctionMetadata): coreTypes.RpcFunctionMetadata {
    const result = {
        ...data,
        bindings: toCoreBindings(data.bindings),
        status: toCoreStatusResult(data.status),
    };
    return ensureKeysMatch(data, result);
}

function toCoreBindings(
    data: { [key: string]: rpc.IBindingInfo } | null | undefined
): { [key: string]: coreTypes.RpcBindingInfo } | null | undefined {
    if (data) {
        const result = {};
        for (const [key, value] of Object.entries(data)) {
            result[key] = toCoreBinding(value);
        }
        return ensureKeysMatch(data, result);
    } else {
        return data;
    }
}

function toCoreBinding(data: rpc.IBindingInfo | null | undefined): coreTypes.RpcBindingInfo | null | undefined {
    if (data) {
        const result = {
            ...data,
            dataType: toCoreBindingDataType(data.dataType),
            direction: toCoreBindingDirection(data.direction),
        };
        return ensureKeysMatch(data, result);
    } else {
        return data;
    }
}

function toCoreBindingDataType(
    data: rpc.BindingInfo.DataType | null | undefined
): coreTypes.RpcBindingDataType | null | undefined {
    switch (data) {
        case rpc.BindingInfo.DataType.binary:
            return 'binary';
        case rpc.BindingInfo.DataType.stream:
            return 'stream';
        case rpc.BindingInfo.DataType.string:
            return 'string';
        case rpc.BindingInfo.DataType.undefined:
            return 'undefined';
        default:
            return handleDefaultEnumCase(data, 'RpcBindingDataType');
    }
}

function toCoreBindingDirection(
    data: rpc.BindingInfo.Direction | null | undefined
): coreTypes.RpcBindingDirection | null | undefined {
    switch (data) {
        case rpc.BindingInfo.Direction.in:
            return 'in';
        case rpc.BindingInfo.Direction.inout:
            return 'inout';
        case rpc.BindingInfo.Direction.out:
            return 'out';
        default:
            return handleDefaultEnumCase(data, 'RpcBindingDirection');
    }
}
