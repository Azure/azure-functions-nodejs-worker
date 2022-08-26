// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as coreTypes from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../../../azure-functions-language-worker-protobuf/src/rpc';
import { ensureKeysMatch } from './ensureKeysMatch';
import { toCoreTypedData } from './toCoreTypedData';

export function toCoreInvocationRequest(data: rpc.IInvocationRequest): coreTypes.RpcInvocationRequest {
    const result = {
        ...data,
        inputData: toCoreParameterBindings(data.inputData),
        triggerMetadata: toCoreTriggerMetadata(data.triggerMetadata),
    };
    return ensureKeysMatch(data, result);
}

function toCoreParameterBindings(
    data: rpc.IParameterBinding[] | null | undefined
): coreTypes.RpcParameterBinding[] | null | undefined {
    if (data) {
        return data.map(toCoreParameterBinding);
    } else {
        return data;
    }
}

function toCoreParameterBinding(data: rpc.IParameterBinding): coreTypes.RpcParameterBinding {
    const result = {
        ...data,
        data: toCoreTypedData(data.data),
    };
    return ensureKeysMatch(data, result);
}

function toCoreTriggerMetadata(
    data: { [key: string]: rpc.ITypedData } | null | undefined
): { [key: string]: coreTypes.RpcTypedData } | null | undefined {
    if (data) {
        const result = {};
        for (const [key, value] of Object.entries(data)) {
            result[key] = toCoreTypedData(value);
        }
        return ensureKeysMatch(data, result);
    } else {
        return data;
    }
}
