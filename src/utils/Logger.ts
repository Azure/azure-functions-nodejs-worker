// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

/**
 * Use these methods only if you want to guarantee the messages reach the host despite potential performance impact.
 * Otherwise, please stick to utilizing the gRPC channel to propagate these messages with category: RpcLogCategory.System
 **/

const logPrefix = 'LanguageWorkerConsoleLog';

export function systemLog(message?: any, ...optionalParams: any[]) {
    console.log(logPrefix + removeNewLines(message), ...optionalParams);
}

export function systemWarn(message?: any, ...optionalParams: any[]) {
    console.warn(logPrefix + '[warn] ' + removeNewLines(message), ...optionalParams);
}

export function systemError(message?: any, ...optionalParams: any[]) {
    console.error(logPrefix + '[error] ' + removeNewLines(message), ...optionalParams);
}

function removeNewLines(message?: any): string {
    if (message && typeof message === 'string') {
        message = message.replace(/(\r\n|\n|\r)/gm, ' ');
    }
    return message;
}
