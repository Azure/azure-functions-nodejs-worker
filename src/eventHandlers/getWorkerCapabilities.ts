// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { WorkerCapabilities } from '@azure/functions-core';
import { worker } from '../WorkerContext';

export async function getWorkerCapabilities(): Promise<WorkerCapabilities> {
    let capabilities: WorkerCapabilities = {
        RawHttpBodyBytes: 'true',
        RpcHttpTriggerMetadataRemoved: 'true',
        RpcHttpBodyOnly: 'true',
        IgnoreEmptyValuedRpcHttpHeaders: 'true',
        UseNullableValueDictionaryForHttp: 'true',
        WorkerStatus: 'true',
        TypedDataCollection: 'true',
        HandlesWorkerTerminateMessage: 'true',
    };

    if (worker.app.programmingModel?.getCapabilities) {
        capabilities = await worker.app.programmingModel.getCapabilities(capabilities);
    }

    return capabilities;
}
