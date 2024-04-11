// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { FunctionCallback, HookCallback, HookData, ProgrammingModel } from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { PackageJson } from './parsers/parsePackageJson';

export interface RegisteredFunction {
    metadata: rpc.IRpcFunctionMetadata;
    callback: FunctionCallback;
}

export interface LegacyRegisteredFunction extends RegisteredFunction {
    thisArg: unknown;
}

export class AppContext {
    packageJson: PackageJson = {};
    /**
     * this hook data will be passed to (and set by) all hooks in all scopes
     */
    appHookData: HookData = {};
    /**
     * this hook data is limited to the app-level scope and persisted only for app-level hooks
     */
    appLevelOnlyHookData: HookData = {};
    programmingModel?: ProgrammingModel;
    preInvocationHooks: HookCallback[] = [];
    postInvocationHooks: HookCallback[] = [];
    appStartHooks: HookCallback[] = [];
    appTerminateHooks: HookCallback[] = [];
    logHooks: HookCallback[] = [];
    functions: { [id: string]: RegisteredFunction } = {};
    legacyFunctions: { [id: string]: LegacyRegisteredFunction } = {};
    workerIndexingLocked = false;
    isUsingWorkerIndexing = false;
    currentEntryPoint?: string;
    blockingAppStartError?: Error;
}
