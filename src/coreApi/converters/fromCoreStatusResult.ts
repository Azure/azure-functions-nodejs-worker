// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as coreTypes from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../../../azure-functions-language-worker-protobuf/src/rpc';
import { ensureKeysMatch } from './ensureKeysMatch';
import { handleDefaultEnumCase } from './handleDefaultEnumCase';

export function fromCoreStatusResult(
    data: coreTypes.RpcStatusResult | null | undefined
): rpc.IStatusResult | null | undefined {
    if (data) {
        const result = {
            ...data,
            logs: fromCoreLogs(data.logs),
            status: fromCoreStatus(data.status),
        };
        return ensureKeysMatch(data, result);
    } else {
        return data;
    }
}

function fromCoreLogs(data: coreTypes.RpcLog[] | null | undefined): rpc.IRpcLog[] | null | undefined {
    if (data) {
        return data.map(fromCoreLog);
    } else {
        return data;
    }
}

function fromCoreLog(data: coreTypes.RpcLog): rpc.IRpcLog {
    const result = {
        ...data,
        level: fromCoreLogLevel(data.level),
        logCategory: fromCoreLogCategory(data.logCategory),
    };
    return ensureKeysMatch(data, result);
}

export function fromCoreLogLevel(data: coreTypes.RpcLogLevel | null | undefined): rpc.RpcLog.Level | null | undefined {
    switch (data) {
        case 'critical':
            return rpc.RpcLog.Level.Critical;
        case 'debug':
            return rpc.RpcLog.Level.Debug;
        case 'error':
            return rpc.RpcLog.Level.Error;
        case 'information':
            return rpc.RpcLog.Level.Information;
        case 'none':
            return rpc.RpcLog.Level.None;
        case 'trace':
            return rpc.RpcLog.Level.Trace;
        case 'warning':
            return rpc.RpcLog.Level.Warning;
        default:
            return handleDefaultEnumCase(data, 'CoreRpcLogLevel');
    }
}

export function fromCoreLogCategory(
    data: coreTypes.RpcLogCategory | null | undefined
): rpc.RpcLog.RpcLogCategory | null | undefined {
    switch (data) {
        case 'customMetric':
            return rpc.RpcLog.RpcLogCategory.CustomMetric;
        case 'system':
            return rpc.RpcLog.RpcLogCategory.System;
        case 'user':
            return rpc.RpcLog.RpcLogCategory.User;
        default:
            return handleDefaultEnumCase(data, 'CoreRpcLogCategory');
    }
}

function fromCoreStatus(data: coreTypes.RpcStatus | null | undefined): rpc.StatusResult.Status | null | undefined {
    switch (data) {
        case 'cancelled':
            return rpc.StatusResult.Status.Cancelled;
        case 'failure':
            return rpc.StatusResult.Status.Failure;
        case 'success':
            return rpc.StatusResult.Status.Success;
        default:
            return handleDefaultEnumCase(data, 'CoreRpcStatus');
    }
}
