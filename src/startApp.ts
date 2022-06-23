// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AppStartContext } from '@azure/functions-core';
import { pathExists } from 'fs-extra';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { loadScriptFile } from './loadScriptFile';
import { ensureErrorType } from './utils/ensureErrorType';
import { WorkerChannel } from './WorkerChannel';
import path = require('path');
import LogLevel = rpc.RpcLog.Level;
import LogCategory = rpc.RpcLog.RpcLogCategory;

/**
 * Starting an app can happen in two places, depending on if the worker was specialized or not
 * 1. The worker can start in "normal" mode, meaning `workerInitRequest` will reference the user's app
 * 2. The worker can start in "placeholder" mode, meaning `workerInitRequest` will reference a dummy app to "warm up" the worker and `functionEnvironmentReloadRequest` will be sent with the user's actual app.
 *    This process is called worker specialization and it helps with cold start times.
 *    The dummy app should never have actual startup code, so it should be safe to call `startApp` twice in this case
 *    Worker specialization happens only once, so we don't need to worry about cleaning up resources from previous `functionEnvironmentReloadRequest`s.
 */
export async function startApp(functionAppDirectory: string, channel: WorkerChannel): Promise<void> {
    await channel.updatePackageJson(functionAppDirectory);
    await loadEntryPointFile(functionAppDirectory, channel);
    const appStartContext: AppStartContext = {
        hookData: channel.appHookData,
        functionAppDirectory,
        hostVersion: channel.hostVersion,
    };
    await channel.executeHooks('appStart', appStartContext);
    channel.appHookData = appStartContext.hookData;
}

async function loadEntryPointFile(functionAppDirectory: string, channel: WorkerChannel): Promise<void> {
    const entryPointFile = channel.packageJson.main;
    if (entryPointFile) {
        channel.log({
            message: `Loading entry point "${entryPointFile}"`,
            level: LogLevel.Debug,
            logCategory: LogCategory.System,
        });
        try {
            const entryPointFullPath = path.join(functionAppDirectory, entryPointFile);
            if (!(await pathExists(entryPointFullPath))) {
                throw new Error(`file does not exist`);
            }

            await loadScriptFile(entryPointFullPath, channel.packageJson);
            channel.log({
                message: `Loaded entry point "${entryPointFile}"`,
                level: LogLevel.Debug,
                logCategory: LogCategory.System,
            });
        } catch (err) {
            const error = ensureErrorType(err);
            error.isAzureFunctionsInternalException = true;
            error.message = `Worker was unable to load entry point "${entryPointFile}": ${error.message}`;
            throw error;
        }
    }
}
