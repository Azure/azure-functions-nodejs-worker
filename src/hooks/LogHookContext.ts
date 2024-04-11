// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { HookData, RpcLogCategory, RpcLogLevel } from '@azure/functions-core';
import * as coreTypes from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { toCoreLog } from '../coreApi/converters/toCoreStatusResult';
import { ReadOnlyError } from '../errors';
import { nonNullProp } from '../utils/nonNull';
import { worker } from '../WorkerContext';

export interface InvocationLogContext {
    hookData: HookData;
    invocationContext: unknown;
}

export class LogHookContext implements coreTypes.LogHookContext {
    level: RpcLogLevel;
    message: string;
    #category: RpcLogCategory;
    #hookData: HookData;
    #invocationContext: unknown;

    constructor(log: rpc.IRpcLog, invocLogCtx: InvocationLogContext | undefined) {
        const coreLog = toCoreLog(log);
        this.level = nonNullProp(coreLog, 'level');
        this.message = nonNullProp(coreLog, 'message');
        this.#category = nonNullProp(coreLog, 'logCategory');
        this.#hookData = invocLogCtx?.hookData ?? {};
        this.#invocationContext = invocLogCtx?.invocationContext;
    }

    get hookData(): HookData {
        return this.#hookData;
    }
    set hookData(_obj: HookData) {
        throw new ReadOnlyError('hookData');
    }
    get category(): RpcLogCategory {
        return this.#category;
    }
    set category(_obj: RpcLogCategory) {
        throw new ReadOnlyError('category');
    }
    get appHookData(): HookData {
        return worker.app.appHookData;
    }
    set appHookData(_obj: HookData) {
        throw new ReadOnlyError('appHookData');
    }
    get invocationContext(): unknown {
        return this.#invocationContext;
    }
    set invocationContext(_obj: unknown) {
        throw new ReadOnlyError('invocationContext');
    }
}
