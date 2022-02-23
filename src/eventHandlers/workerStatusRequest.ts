// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { WorkerChannel } from '../WorkerChannel';

/**
 * Worker sends the host empty response to evaluate the worker's latency
 */
export function workerStatusRequest(channel: WorkerChannel, requestId: string, _msg: rpc.WorkerStatusRequest): void {
    const workerStatusResponse: rpc.IWorkerStatusResponse = {};
    channel.eventStream.write({
        requestId: requestId,
        workerStatusResponse,
    });
}
