// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import * as url from 'url';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { AzFuncSystemError } from './errors';
import { PackageJson } from './parsers/parsePackageJson';
import { WorkerChannel } from './WorkerChannel';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

export async function loadScriptFile(
    channel: WorkerChannel,
    filePath: string,
    packageJson: PackageJson
): Promise<unknown> {
    const start = Date.now();
    try {
        let script: unknown;
        if (isESModule(filePath, packageJson)) {
            const fileUrl = url.pathToFileURL(filePath);
            if (fileUrl.href) {
                // use eval so it doesn't get compiled into a require()
                script = await eval('import(fileUrl.href)');
            } else {
                throw new AzFuncSystemError(`'${filePath}' could not be converted to file URL (${fileUrl.href})`);
            }
        } else {
            script = require(/* webpackIgnore: true */ filePath);
        }
        return script;
    } finally {
        warnIfLongLoadTime(channel, filePath, start);
    }
}

function warnIfLongLoadTime(channel: WorkerChannel, filePath: string, start: number): void {
    const timeElapsed = Date.now() - start;
    const rfpName = 'WEBSITE_RUN_FROM_PACKAGE';
    const rfpValue = process.env[rfpName];
    if (timeElapsed > 1000 && (rfpValue === undefined || rfpValue === '0')) {
        channel.log({
            message: `Loading "${path.basename(filePath)}" took ${timeElapsed}ms`,
            level: LogLevel.Warning,
            logCategory: LogCategory.System,
        });
        channel.log({
            message: `Set "${rfpName}" to "1" to significantly improve load times. Learn more here: https://aka.ms/AAjon54`,
            level: LogLevel.Warning,
            logCategory: LogCategory.System,
        });
    }
}

export function isESModule(filePath: string, packageJson: PackageJson): boolean {
    if (filePath.endsWith('.mjs')) {
        return true;
    }
    if (filePath.endsWith('.cjs')) {
        return false;
    }
    return packageJson.type === 'module';
}
