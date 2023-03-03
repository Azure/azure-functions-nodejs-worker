// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { version as workerVersion } from '../constants';
import { WorkerChannel } from '../WorkerChannel';

export function getWorkerMetadata(channel: WorkerChannel): rpc.IWorkerMetadata {
    const result: rpc.IWorkerMetadata = {
        runtimeName: 'node',
        runtimeVersion: process.versions.node,
        workerBitness: process.arch,
        workerVersion,
    };
    if (channel.programmingModel) {
        result.customProperties = {
            modelName: channel.programmingModel.name,
            modelVersion: channel.programmingModel.version,
        };
    }
    return result;
}
