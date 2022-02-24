// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';

export function toRpcStatus(err?: any, errorMessage?: string): rpc.IStatusResult {
    const status: rpc.IStatusResult = {
        status: rpc.StatusResult.Status.Success,
    };

    if (err) {
        status.status = rpc.StatusResult.Status.Failure;
        status.exception = {
            message: errorMessage || err.toString(),
            stackTrace: err.stack,
        };
    }

    return status;
}
