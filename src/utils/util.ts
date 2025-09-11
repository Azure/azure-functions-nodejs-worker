// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as semver from 'semver';
import { NODE_EOL_DATES, NODE_EOL_WARNING_DATES, upgradeUrl } from '../constants';
import { worker } from '../WorkerContext';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';

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

export function validateNodeVersion(version: string) {
    try {
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
            worker.log({
                message: msg,
                level: rpc.RpcLog.Level.Warning,
                logCategory: rpc.RpcLog.RpcLogCategory.System,
            });
        } else if (today >= eolDateStr) {
            const msg = `Node.js ${major} reached EOL on ${eolDateStr}. Please upgrade to a supported version: ${upgradeUrl}`;
            worker.log({
                message: msg,
                level: rpc.RpcLog.Level.Error,
                logCategory: rpc.RpcLog.RpcLogCategory.System,
            });
        } else if (today >= warningDateStr) {
            const msg = `Node.js ${major} will reach EOL on ${eolDateStr}. Consider upgrading: ${upgradeUrl}`;
            worker.log({
                message: msg,
                level: rpc.RpcLog.Level.Warning,
                logCategory: rpc.RpcLog.RpcLogCategory.System,
            });
        }
    } catch (err) {
        const unknownError = 'Error validating Node.js version. ';
        worker.log({
            message: unknownError + err,
            level: rpc.RpcLog.Level.Error,
            logCategory: rpc.RpcLog.RpcLogCategory.System,
        });
        throw err;
    }
}
