// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as retry from 'p-retry';
import * as path from 'path';
import * as url from 'url';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { worker } from './WorkerContext';
import { AzFuncSystemError } from './errors';
import { PackageJson } from './parsers/parsePackageJson';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

export async function loadScriptFile(filePath: string, packageJson: PackageJson): Promise<unknown> {
    // See the following issue for more details on why we want to retry
    // https://github.com/Azure/azure-functions-nodejs-worker/issues/693
    const fileName = path.basename(filePath);
    return await retry(
        async (currentAttempt: number) => {
            if (currentAttempt > 1) {
                worker.log({
                    message: `Retrying load of file "${fileName}". Attempt ${currentAttempt}/${10}`,
                    level: LogLevel.Debug,
                    logCategory: LogCategory.System,
                });
            }
            return loadScriptFileInternal(filePath, packageJson);
        },
        {
            retries: 9,
            minTimeout: 50,
            onFailedAttempt: (error) => {
                if (!/lstat.*home/.test(error?.message || '')) {
                    // this will abort the retries if it's an error we don't recognize
                    throw error;
                } else if (error.retriesLeft > 0) {
                    worker.log({
                        message: `Warning: Failed to load file "${fileName}" with error "${error.message}"`,
                        level: LogLevel.Warning,
                        logCategory: LogCategory.System,
                    });
                }
            },
        }
    );
}

async function loadScriptFileInternal(filePath: string, packageJson: PackageJson): Promise<unknown> {
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
        warnIfLongLoadTime(filePath, start);
    }
}

function warnIfLongLoadTime(filePath: string, start: number): void {
    const timeElapsed = Date.now() - start;
    const rfpName = 'WEBSITE_RUN_FROM_PACKAGE';
    const rfpValue = process.env[rfpName];
    if (
        timeElapsed > 1000 &&
        (rfpValue === undefined || rfpValue === '0') &&
        process.env.AZURE_FUNCTIONS_ENVIRONMENT !== 'Development' // don't show in core tools
    ) {
        worker.log({
            message: `Loading "${path.basename(filePath)}" took ${timeElapsed}ms`,
            level: LogLevel.Warning,
            logCategory: LogCategory.System,
        });
        worker.log({
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
