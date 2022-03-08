// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { access, constants } from 'fs';
import * as path from 'path';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { isError } from '../utils/ensureErrorType';
import { InternalException } from '../utils/InternalException';
import { systemError } from '../utils/Logger';
import { toRpcStatus } from '../utils/toRpcStatus';
import { WorkerChannel } from '../WorkerChannel';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

/**
 * Host sends capabilities/init data to worker and requests the worker to initialize itself
 * @param requestId gRPC message request id
 * @param msg gRPC message content
 */
export async function workerInitRequest(channel: WorkerChannel, requestId: string, msg: rpc.IWorkerInitRequest) {
    // Validate version
    const version = process.version;
    if (
        (version.startsWith('v17.') || version.startsWith('v15.')) &&
        process.env.AZURE_FUNCTIONS_ENVIRONMENT == 'Development'
    ) {
        const msg =
            'Node.js version used (' +
            version +
            ') is not officially supported. You may use it during local development, but must use an officially supported version on Azure:' +
            ' https://aka.ms/functions-node-versions';
        channel.log({
            message: msg,
            level: LogLevel.Warning,
            logCategory: LogCategory.System,
        });
    } else if (!(version.startsWith('v14.') || version.startsWith('v16.'))) {
        const errorMsg =
            'Incompatible Node.js version' +
            ' (' +
            version +
            ').' +
            ' The version of the Azure Functions runtime you are using (v4) supports Node.js v14.x or Node.js v16.x' +
            ' Refer to our documentation to see the Node.js versions supported by each version of Azure Functions: https://aka.ms/functions-node-versions';
        systemError(errorMsg);
        throw new InternalException(errorMsg);
    }

    logColdStartWarning(channel);
    if (msg.functionAppDirectory) {
        await channel.initAppDir(msg.functionAppDirectory);
    }

    const workerCapabilities = {
        RpcHttpTriggerMetadataRemoved: 'true',
        RpcHttpBodyOnly: 'true',
        IgnoreEmptyValuedRpcHttpHeaders: 'true',
        UseNullableValueDictionaryForHttp: 'true',
        WorkerStatus: 'true',
        TypedDataCollection: 'true',
    };

    channel.eventStream.write({
        requestId: requestId,
        workerInitResponse: {
            result: toRpcStatus(),
            capabilities: workerCapabilities,
        },
    });
}

export function logColdStartWarning(channel: WorkerChannel, delayInMs?: number): void {
    // On reading a js file with function code('require') NodeJs tries to find 'package.json' all the way up to the file system root.
    // In Azure files it causes a delay during cold start as connection to Azure Files is an expensive operation.
    if (
        process.env.WEBSITE_CONTENTAZUREFILECONNECTIONSTRING &&
        process.env.WEBSITE_CONTENTSHARE &&
        process.env.AzureWebJobsScriptRoot
    ) {
        // Add delay to avoid affecting coldstart
        if (!delayInMs) {
            delayInMs = 5000;
        }
        setTimeout(() => {
            access(path.join(process.env.AzureWebJobsScriptRoot!, 'package.json'), constants.F_OK, (err) => {
                if (isError(err)) {
                    channel.log({
                        message:
                            'package.json is not found at the root of the Function App in Azure Files - cold start for NodeJs can be affected.',
                        level: LogLevel.Debug,
                        logCategory: LogCategory.System,
                    });
                }
            });
        }, delayInMs);
    }
}
