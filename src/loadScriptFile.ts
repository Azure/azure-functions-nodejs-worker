// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as retry from 'p-retry';
import * as path from 'path';
import * as url from 'url';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { AzFuncSystemError } from './errors';
import { PackageJson } from './parsers/parsePackageJson';
import { worker } from './WorkerContext';

let hasLoggedAttempt = 0;
let hasLoggedWarning = false;

export async function loadScriptFile(filePath: string, packageJson: PackageJson): Promise<unknown> {
    // See the following issue for more details on why we want to retry
    // https://github.com/Azure/azure-functions-nodejs-worker/issues/693
    const retries = 9;
    return await retry(
        async (currentAttempt: number) => {
            if (currentAttempt > 1 && currentAttempt > hasLoggedAttempt) {
                worker.log({
                    message: `Retrying file load. Attempt ${currentAttempt}/${retries + 1}`,
                    level: rpc.RpcLog.Level.Debug,
                    logCategory: rpc.RpcLog.RpcLogCategory.System,
                });
                hasLoggedAttempt = currentAttempt;
            }
            return loadScriptFileInternal(filePath, packageJson);
        },
        {
            retries: retries,
            minTimeout: 500,
            onFailedAttempt: (error) => {
                if (!/lstat.*home/i.test(error?.message || '')) {
                    // this will abort the retries if it's an error we don't recognize
                    throw error;
                } else if (error.retriesLeft > 0 && !hasLoggedWarning) {
                    worker.log({
                        message: `Warning: Failed to load file with error "${error.message}"`,
                        level: rpc.RpcLog.Level.Warning,
                        logCategory: rpc.RpcLog.RpcLogCategory.System,
                    });
                    hasLoggedWarning = true;
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
            level: rpc.RpcLog.Level.Warning,
            logCategory: rpc.RpcLog.RpcLogCategory.System,
        });
        worker.log({
            message: `Set "${rfpName}" to "1" to significantly improve load times. Learn more here: https://aka.ms/AAjon54`,
            level: rpc.RpcLog.Level.Warning,
            logCategory: rpc.RpcLog.RpcLogCategory.System,
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
