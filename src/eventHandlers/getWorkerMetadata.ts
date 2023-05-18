// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { worker } from '../WorkerContext';
import { version as workerVersion } from '../constants';

export function getWorkerMetadata(): rpc.IWorkerMetadata {
    const result: rpc.IWorkerMetadata = {
        runtimeName: 'node',
        runtimeVersion: process.versions.node,
        // analytics team wants bitness to be consistent across workers, so we have to adjust this
        workerBitness: process.arch === 'ia32' ? 'x86' : process.arch,
        workerVersion,
    };
    if (worker.app.programmingModel) {
        result.customProperties = {
            modelName: worker.app.programmingModel.name,
            modelVersion: worker.app.programmingModel.version,
        };
    }
    return result;
}
