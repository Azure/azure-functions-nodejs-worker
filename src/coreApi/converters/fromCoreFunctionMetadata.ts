// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as coreTypes from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../../../azure-functions-language-worker-protobuf/src/rpc';
import { ensureKeysMatch } from './ensureKeysMatch';
import { fromCoreStatusResult } from './fromCoreStatusResult';
import { handleDefaultEnumCase } from './handleDefaultEnumCase';

export function fromCoreFunctionMetadata(data: coreTypes.RpcFunctionMetadata): rpc.IRpcFunctionMetadata {
    const result = {
        ...data,
        bindings: fromCoreBindings(data.bindings),
        status: fromCoreStatusResult(data.status),
        retryOptions: fromCoreRetryOptions(data.retryOptions),
    };
    return ensureKeysMatch(data, result);
}

function fromCoreBindings(
    data: { [key: string]: coreTypes.RpcBindingInfo } | null | undefined
): { [key: string]: rpc.IBindingInfo } | null | undefined {
    if (data) {
        const result = {};
        for (const [key, value] of Object.entries(data)) {
            result[key] = fromCoreBinding(value);
        }
        return ensureKeysMatch(data, result);
    } else {
        return data;
    }
}

function fromCoreBinding(data: coreTypes.RpcBindingInfo | null | undefined): rpc.IBindingInfo | null | undefined {
    if (data) {
        const result = {
            ...data,
            dataType: fromCoreBindingDataType(data.dataType),
            direction: fromCoreBindingDirection(data.direction),
        };
        return ensureKeysMatch(data, result);
    } else {
        return data;
    }
}

function fromCoreBindingDataType(
    data: coreTypes.RpcBindingDataType | null | undefined
): rpc.BindingInfo.DataType | null | undefined {
    switch (data) {
        case 'binary':
            return rpc.BindingInfo.DataType.binary;
        case 'stream':
            return rpc.BindingInfo.DataType.stream;
        case 'string':
            return rpc.BindingInfo.DataType.string;
        case 'undefined':
            return rpc.BindingInfo.DataType.undefined;
        default:
            return handleDefaultEnumCase(data, 'CoreRpcBindingDataType');
    }
}

function fromCoreBindingDirection(
    data: coreTypes.RpcBindingDirection | null | undefined
): rpc.BindingInfo.Direction | null | undefined {
    switch (data) {
        case 'in':
            return rpc.BindingInfo.Direction.in;
        case 'inout':
            return rpc.BindingInfo.Direction.inout;
        case 'out':
            return rpc.BindingInfo.Direction.out;
        default:
            return handleDefaultEnumCase(data, 'CoreRpcBindingDirection');
    }
}

function fromCoreRetryOptions(
    data: coreTypes.RpcRetryOptions | null | undefined
): rpc.IRpcRetryOptions | null | undefined {
    if (data) {
        const result = {
            ...data,
            retryStrategy: fromCoreRetryStrategy(data.retryStrategy),
        };
        return ensureKeysMatch(data, result);
    } else {
        return data;
    }
}

function fromCoreRetryStrategy(
    data: coreTypes.RpcRetryStrategy | null | undefined
): rpc.RpcRetryOptions.RetryStrategy | null | undefined {
    switch (data) {
        case 'exponentialBackoff':
            return rpc.RpcRetryOptions.RetryStrategy.exponential_backoff;
        case 'fixedDelay':
            return rpc.RpcRetryOptions.RetryStrategy.fixed_delay;
        default:
            return handleDefaultEnumCase(data, 'CoreRpcRetryStrategy');
    }
}
