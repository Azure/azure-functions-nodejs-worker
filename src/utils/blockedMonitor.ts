// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzureFunctionsRpcMessages as rpc } from './../../azure-functions-language-worker-protobuf/src/rpc';
import blockedAt = require('blocked-at');

export function startBlockedMonitor(
    worker: { log: (log: rpc.IRpcLog) => void },
    threshold = 500,
    intreval = 10000
): NodeJS.Timer {
    function logBlockedWarning(message: string) {
        worker.log({
            message,
            level: rpc.RpcLog.Level.Warning,
            logCategory: rpc.RpcLog.RpcLogCategory.System,
        });
    }

    logBlockedWarning(
        `Monitoring for blocking code is turned on, with a threshold of ${threshold} ms. This will have a negative impact on performance. Adjust "AZURE_FUNCTIONS_NODE_BLOCK_LOG" to turn it off. ` +
            'IMPORTANT NOTE: The stack traces are only an approximation and you should analyze all synchronous operations'
    );

    let blockedHistory: { time: string; duration: number; stack: string[] }[] = [];

    //threshold - minimum miliseconds of blockage to report.
    //other parameters are default, more details on https://github.com/naugtur/blocked-at.
    blockedAt(
        (ms, stack) => {
            const date = new Date();
            blockedHistory.push({ time: date.toISOString(), duration: ms, stack: stack });
        },
        { threshold: threshold }
    );

    // Log blockedHistory if it's not empty each 10 seconds
    return setInterval(() => {
        if (blockedHistory.length > 0) {
            logBlockedWarning(`Blocking code monitoring history: ${JSON.stringify(blockedHistory)}`);
            blockedHistory = [];
        }
    }, intreval);
}
