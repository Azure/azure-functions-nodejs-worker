// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as semver from 'semver';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { NODE_EOL_DATES, NODE_EOL_WARNING_DATES, upgradeUrl } from '../constants';
import { worker } from '../WorkerContext';

export function isEnvironmentVariableSet(val: string | boolean | number | undefined | null): boolean {
    return !/^(false|0)?$/i.test(val === undefined || val === null ? '' : String(val));
}

export function isNode20Plus(): boolean {
    return semver.gte(process.versions.node, '20.0.0');
}

function currentYearMonth(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

interface NodeVersionLog {
    message: string;
    level: rpc.RpcLog.Level;
}

export function getNodeVersionLog(version: string): NodeVersionLog | undefined {
    const versionSplit = version.split('.');
    if (versionSplit.length != 3) {
        throw new Error("Could not parse Node.js version: '" + version + "'");
    }

    const major = versionSplit[0]; // e.g. "v18"
    const warningDateStr = NODE_EOL_WARNING_DATES[major];
    const eolDateStr = NODE_EOL_DATES[major];
    const today = currentYearMonth();
    if (!warningDateStr || !eolDateStr) {
        const msg = `Incompatible Node.js version ${major}. Refer to our documentation to see the Node.js versions supported by each version of Azure Functions: ${upgradeUrl}`;
        return {
            message: msg,
            level: rpc.RpcLog.Level.Warning,
        };
    } else if (today >= eolDateStr) {
        const msg = `Node.js ${major} reached EOL on ${eolDateStr}. Please upgrade to a supported version: ${upgradeUrl}`;
        return {
            message: msg,
            level: rpc.RpcLog.Level.Error,
        };
    } else if (today >= warningDateStr) {
        const msg = `Node.js ${major} will reach EOL on ${eolDateStr}. Consider upgrading: ${upgradeUrl}`;
        return {
            message: msg,
            level: rpc.RpcLog.Level.Warning,
        };
    }
    return undefined;
}

export function validateNodeVersion(version: string) {
    try {
        const logEntry = getNodeVersionLog(version);
        if (logEntry) {
            worker.log({
                message: logEntry.message,
                level: logEntry.level,
                logCategory: rpc.RpcLog.RpcLogCategory.System,
            });
        }
    } catch (err) {
        worker.log({
            message: 'Error validating Node.js version. ' + err,
            level: rpc.RpcLog.Level.Error,
            logCategory: rpc.RpcLog.RpcLogCategory.System,
        });
        throw err;
    }
}
