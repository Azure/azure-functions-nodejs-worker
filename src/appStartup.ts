// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AppStartupContext } from '@azure/functions-core';
import { pathExists } from 'fs-extra';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { loadScriptFile } from './loadScriptFile';
import { ensureErrorType } from './utils/ensureErrorType';
import { WorkerChannel } from './WorkerChannel';
import path = require('path');
import LogLevel = rpc.RpcLog.Level;
import LogCategory = rpc.RpcLog.RpcLogCategory;

export async function appStartup(functionAppDirectory: string, channel: WorkerChannel): Promise<void> {
    await channel.updatePackageJson(functionAppDirectory);
    await loadEntryPointFile(functionAppDirectory, channel);
    const appStartupContext: AppStartupContext = {
        hookData: channel.appHookData,
        functionAppDirectory,
        hostVersion: channel.hostVersion,
    };
    await channel.executeHooks('appStartup', appStartupContext);
    channel.appHookData = appStartupContext.hookData;
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
