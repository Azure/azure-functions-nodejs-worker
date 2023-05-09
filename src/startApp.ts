// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AppStartContext } from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { AzFuncSystemError, ensureErrorType, ReadOnlyError } from './errors';
import { loadScriptFile } from './loadScriptFile';
import { WorkerChannel } from './WorkerChannel';
import globby = require('globby');
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
        get hookData() {
            return channel.app.appLevelOnlyHookData;
        },
        set hookData(_obj) {
            throw new ReadOnlyError('hookData');
        },
        get appHookData() {
            return channel.app.appHookData;
        },
        set appHookData(_obj) {
            throw new ReadOnlyError('appHookData');
        },
        functionAppDirectory,
    };
    await channel.executeHooks('appStart', appStartContext);
}

async function loadEntryPointFile(functionAppDirectory: string, channel: WorkerChannel): Promise<void> {
    const entryPointPattern = channel.app.packageJson.main;
    if (entryPointPattern) {
        let currentFile: string | undefined = undefined;
        try {
            const files = await globby(entryPointPattern, { cwd: functionAppDirectory });
            if (files.length === 0) {
                throw new AzFuncSystemError(`Found zero files matching the supplied pattern`);
            }

            for (const file of files) {
                currentFile = file;
                channel.log({
                    message: `Loading entry point file "${file}"`,
                    level: LogLevel.Debug,
                    logCategory: LogCategory.System,
                });
                try {
                    const entryPointFilePath = path.join(functionAppDirectory, file);
                    channel.app.currentEntryPoint = entryPointFilePath;
                    await loadScriptFile(channel, entryPointFilePath, channel.app.packageJson);
                } finally {
                    channel.app.currentEntryPoint = undefined;
                }
                channel.log({
                    message: `Loaded entry point file "${file}"`,
                    level: LogLevel.Debug,
                    logCategory: LogCategory.System,
                });
            }
        } catch (err) {
            const error = ensureErrorType(err);
            channel.log({
                message: `Worker was unable to load entry point "${currentFile ? currentFile : entryPointPattern}": ${
                    error.message
                }`,
                level: LogLevel.Warning,
                logCategory: LogCategory.System,
            });
        }
    }
}
