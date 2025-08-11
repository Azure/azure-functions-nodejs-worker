// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { ProgrammingModel } from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { worker } from '../WorkerContext';

export function setProgrammingModel(programmingModel: ProgrammingModel): void {
    // Log when setting the programming model, except for the initial default one (partially because the grpc channels aren't fully setup at that time)
    if (worker.app.programmingModel) {
        worker.log({
            message: `Setting Node.js programming model to "${programmingModel.name}" version "${programmingModel.version}"`,
            level: rpc.RpcLog.Level.Information,
            logCategory: rpc.RpcLog.RpcLogCategory.System,
        });
    } else {
        worker.defaultProgrammingModel = programmingModel;
    }
    worker.app.programmingModel = programmingModel;
}
