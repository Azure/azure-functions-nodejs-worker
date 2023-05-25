// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { ProgrammingModel } from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { channel } from '../WorkerChannel';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

export function setProgrammingModel(programmingModel: ProgrammingModel): void {
    // Log when setting the programming model, except for the initial default one (partially because the grpc channels aren't fully setup at that time)
    if (channel.app.programmingModel) {
        channel.log({
            message: `Setting Node.js programming model to "${programmingModel.name}" version "${programmingModel.version}"`,
            level: LogLevel.Information,
            logCategory: LogCategory.System,
        });
    } else {
        channel.defaultProgrammingModel = programmingModel;
    }
    channel.app.programmingModel = programmingModel;
}
