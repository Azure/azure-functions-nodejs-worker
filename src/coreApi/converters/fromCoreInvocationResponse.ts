// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as coreTypes from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../../../azure-functions-language-worker-protobuf/src/rpc';
import { ensureKeysMatch } from './ensureKeysMatch';
import { fromCoreStatusResult } from './fromCoreStatusResult';
import { fromCoreTypedData } from './fromCoreTypedData';

export function fromCoreInvocationResponse(data: coreTypes.RpcInvocationResponse): rpc.IInvocationResponse {
    const result = {
        ...data,
        outputData: fromCoreParameterBindings(data.outputData),
        result: fromCoreStatusResult(data.result),
        returnValue: fromCoreTypedData(data.returnValue),
    };
    return ensureKeysMatch(data, result);
}

function fromCoreParameterBindings(
    data: coreTypes.RpcParameterBinding[] | null | undefined
): rpc.IParameterBinding[] | null | undefined {
    if (data) {
        return data.map(fromCoreParameterBinding);
    } else {
        return data;
    }
}

function fromCoreParameterBinding(data: coreTypes.RpcParameterBinding): rpc.IParameterBinding {
    const result = {
        ...data,
        data: fromCoreTypedData(data.data),
    };
    return ensureKeysMatch(data, result);
}
