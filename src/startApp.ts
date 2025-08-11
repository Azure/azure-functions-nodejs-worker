// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AppStartContext } from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { AzFuncSystemError, ensureErrorType, ReadOnlyError, trySetErrorMessage } from './errors';
import { executeHooks } from './hooks/executeHooks';
import { loadScriptFile } from './loadScriptFile';
import { parsePackageJson } from './parsers/parsePackageJson';
import { isDefined, nonNullProp } from './utils/nonNull';
import { isEnvironmentVariableSet, isNode20Plus } from './utils/util';
import { worker } from './WorkerContext';
import globby = require('globby');
import path = require('path');

/**
 * Starting an app can happen in two places, depending on if the worker was specialized or not
 * 1. The worker can start in "normal" mode, meaning `workerInitRequest` will reference the user's app
 * 2. The worker can start in "placeholder" mode, meaning `workerInitRequest` will reference a dummy app to "warm up" the worker and `functionEnvironmentReloadRequest` will be sent with the user's actual app.
 *    This process is called worker specialization and it helps with cold start times.
 *    The dummy app should never have actual startup code, so it should be safe to call `startApp` twice in this case
 *    Worker specialization happens only once, so we don't need to worry about cleaning up resources from previous `functionEnvironmentReloadRequest`s.
 */
export async function startApp(functionAppDirectory: string): Promise<void> {
    await updatePackageJson(functionAppDirectory);
    await loadEntryPointFile(functionAppDirectory);
    const appStartContext: AppStartContext = {
        get hookData() {
            return worker.app.appLevelOnlyHookData;
        },
        set hookData(_obj) {
            throw new ReadOnlyError('hookData');
        },
        get appHookData() {
            return worker.app.appHookData;
        },
        set appHookData(_obj) {
            throw new ReadOnlyError('appHookData');
        },
        functionAppDirectory,
    };
    await executeHooks('appStart', appStartContext);
}

async function updatePackageJson(functionAppDirectory: string): Promise<void> {
    try {
        worker.app.packageJson = await parsePackageJson(functionAppDirectory);
    } catch (err) {
        const error = ensureErrorType(err);
        worker.log({
            message: `Worker failed to load package.json: ${error.message}`,
            level: rpc.RpcLog.Level.Warning,
            logCategory: rpc.RpcLog.RpcLogCategory.System,
        });
        worker.app.packageJson = {};
    }
}

async function loadEntryPointFile(functionAppDirectory: string): Promise<void> {
    const entryPointPattern = worker.app.packageJson.main;
    if (entryPointPattern) {
        let currentFile: string | undefined = undefined;
        try {
            const files = await globby(entryPointPattern, { cwd: functionAppDirectory });
            if (files.length === 0) {
                let message: string = globby.hasMagic(entryPointPattern, { cwd: functionAppDirectory })
                    ? 'Found zero files matching the supplied pattern'
                    : 'File does not exist';

                if (entryPointPattern === 'index.js') {
                    // This is by far the most common error and typically happens by accident, so we'll give these folks a little more help
                    message += '. Learn more here: https://aka.ms/AAla7et';
                }

                throw new AzFuncSystemError(message);
            }

            for (const file of files) {
                currentFile = file;
                worker.log({
                    message: `Loading entry point file "${file}"`,
                    level: rpc.RpcLog.Level.Debug,
                    logCategory: rpc.RpcLog.RpcLogCategory.System,
                });
                try {
                    const entryPointFilePath = path.join(functionAppDirectory, file);
                    worker.app.currentEntryPoint = entryPointFilePath;
                    await loadScriptFile(entryPointFilePath, worker.app.packageJson);
                } finally {
                    worker.app.currentEntryPoint = undefined;
                }
                worker.log({
                    message: `Loaded entry point file "${file}"`,
                    level: rpc.RpcLog.Level.Debug,
                    logCategory: rpc.RpcLog.RpcLogCategory.System,
                });
            }
        } catch (err) {
            const error = ensureErrorType(err);
            const newMessage = `Worker was unable to load entry point "${currentFile || entryPointPattern}": ${
                error.message
            }`;

            if (shouldBlockOnEntryPointError()) {
                trySetErrorMessage(error, newMessage);
                error.isAzureFunctionsSystemError = true;
                // We don't want to throw this error now (during workerInit or funcEnvReload) because technically the worker is fine
                // Instead, it will be thrown during functionMetadata or functionLoad response which better indicates that the user's app is the problem
                worker.app.blockingAppStartError = error;
                // This will ensure the error makes it to the user's app insights
                console.error(error.stack);
            } else {
                // In this case, the error will never block the app
                // The most we can do without breaking backwards compatibility is log it as an rpc system log below
            }

            // Always log as rpc system log, which goes to our internal telemetry
            worker.log({
                message: newMessage,
                level: rpc.RpcLog.Level.Error,
                logCategory: rpc.RpcLog.RpcLogCategory.System,
            });
            error.loggedOverRpc = true;
        }
    }
}

function shouldBlockOnEntryPointError(): boolean {
    if (isNode20Plus()) {
        // Starting with Node 20, this will always be blocking
        // https://github.com/Azure/azure-functions-nodejs-worker/issues/697
        return true;
    } else {
        const key = 'FUNCTIONS_NODE_BLOCK_ON_ENTRY_POINT_ERROR';
        if (isDefined(process.env[key])) {
            return isEnvironmentVariableSet(process.env[key]);
        } else {
            // We think this should be a blocking error by default, but v3 can't do that for backwards compatibility reasons
            // https://github.com/Azure/azure-functions-nodejs-worker/issues/630
            const model = nonNullProp(worker.app, 'programmingModel');
            return !(model.name === '@azure/functions' && model.version.startsWith('3.'));
        }
    }
}
