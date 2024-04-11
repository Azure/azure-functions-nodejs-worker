// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as coreTypes from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../../../azure-functions-language-worker-protobuf/src/rpc';
import { ensureKeysMatch } from './ensureKeysMatch';
import { handleDefaultEnumCase } from './handleDefaultEnumCase';

export function toCoreStatusResult(
    data: rpc.IStatusResult | null | undefined
): coreTypes.RpcStatusResult | null | undefined {
    if (data) {
        const result = {
            ...data,
            logs: toCoreLogs(data.logs),
            status: toCoreStatus(data.status),
        };
        return ensureKeysMatch(data, result);
    } else {
        return data;
    }
}

function toCoreLogs(data: rpc.IRpcLog[] | null | undefined): coreTypes.RpcLog[] | null | undefined {
    if (data) {
        return data.map(toCoreLog);
    } else {
        return data;
    }
}

export function toCoreLog(data: rpc.IRpcLog): coreTypes.RpcLog {
    const result = {
        ...data,
        level: toCoreLogLevel(data.level),
        logCategory: toCoreLogCategory(data.logCategory),
    };
    return ensureKeysMatch(data, result);
}

function toCoreLogLevel(data: rpc.RpcLog.Level | null | undefined): coreTypes.RpcLogLevel | null | undefined {
    switch (data) {
        case rpc.RpcLog.Level.Critical:
            return 'critical';
        case rpc.RpcLog.Level.Debug:
            return 'debug';
        case rpc.RpcLog.Level.Error:
            return 'error';
        case rpc.RpcLog.Level.Information:
            return 'information';
        case rpc.RpcLog.Level.None:
            return 'none';
        case rpc.RpcLog.Level.Trace:
            return 'trace';
        case rpc.RpcLog.Level.Warning:
            return 'warning';
        default:
            return handleDefaultEnumCase(data, 'RpcLogLevel');
    }
}

function toCoreLogCategory(
    data: rpc.RpcLog.RpcLogCategory | null | undefined
): coreTypes.RpcLogCategory | null | undefined {
    switch (data) {
        case rpc.RpcLog.RpcLogCategory.CustomMetric:
            return 'customMetric';
        case rpc.RpcLog.RpcLogCategory.System:
            return 'system';
        case rpc.RpcLog.RpcLogCategory.User:
            return 'user';
        default:
            return handleDefaultEnumCase(data, 'RpcLogCategory');
    }
}

function toCoreStatus(data: rpc.StatusResult.Status | null | undefined): coreTypes.RpcStatus | null | undefined {
    switch (data) {
        case rpc.StatusResult.Status.Cancelled:
            return 'cancelled';
        case rpc.StatusResult.Status.Failure:
            return 'failure';
        case rpc.StatusResult.Status.Success:
            return 'success';
        default:
            return handleDefaultEnumCase(data, 'RpcStatus');
    }
}
