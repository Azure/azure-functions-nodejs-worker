// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzureFunctionsRpcMessages as rpc } from './../../azure-functions-language-worker-protobuf/src/rpc';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;
import blockedAt = require('blocked-at');

export function startBlockedMonitor(channel: { log: (log: rpc.IRpcLog) => void }, threshold = 100): NodeJS.Timer {
    let blockedHistory: { time: string; duration: number; stack: string; resource: string }[] = [];

    //threshold - minimum miliseconds of blockage to report.
    //other parameters are default, more details on https://github.com/naugtur/blocked-at.
    blockedAt(
        (ms, stack, resource) => {
            blockedHistory.push({ time: new Date().toUTCString(), duration: ms, stack: stack, resource: resource });
        },
        { threshold: threshold }
    );

    // Log blockedHistory if it's not empty each 10 seconds
    return setInterval(() => {
        if (blockedHistory.length > 0) {
            channel.log({
                message: `Event loop blocked: ${JSON.stringify(blockedHistory)}`,
                level: LogLevel.Warning,
                logCategory: LogCategory.System,
            });
            blockedHistory = [];
        }
    }, 10000);
}
