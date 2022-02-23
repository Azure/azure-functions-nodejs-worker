// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { ensureErrorType, isError } from './ensureErrorType';

export function toRpcStatus(err?: unknown, errorMessage?: string): rpc.IStatusResult {
    const status: rpc.IStatusResult = {
        status: rpc.StatusResult.Status.Success,
    };

    if (isError(err)) {
        const error = ensureErrorType(err);
        status.status = rpc.StatusResult.Status.Failure;
        status.exception = {
            message: errorMessage || error.message,
            stackTrace: error.stack,
        };
    }

    return status;
}
