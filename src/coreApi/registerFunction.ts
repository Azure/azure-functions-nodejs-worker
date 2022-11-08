// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { FunctionCallback, FunctionMetadata } from '@azure/functions-core';
import * as path from 'path';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { Disposable } from '../Disposable';
import { AzFuncSystemError } from '../errors';
import { WorkerChannel } from '../WorkerChannel';
import { fromCoreFunctionMetadata } from './converters/fromCoreFunctionMetadata';

export function registerFunction(
    channel: WorkerChannel,
    metadata: FunctionMetadata,
    callback: FunctionCallback
): Disposable {
    if (channel.workerIndexingLocked) {
        throw new AzFuncSystemError('A function can only be registered during app startup.');
    }
    channel.isUsingWorkerIndexing = true;

    const functionId = metadata.functionId || metadata.name;

    const rpcMetadata: rpc.IRpcFunctionMetadata = fromCoreFunctionMetadata(metadata);
    rpcMetadata.functionId = functionId;
    // `rawBindings` is what's actually used by the host
    // `bindings` is used by the js library in both the old host indexing and the new worker indexing
    rpcMetadata.rawBindings = Object.entries(metadata.bindings).map(([name, binding]) => {
        return JSON.stringify({ ...binding, name });
    });

    // The host validates that the `scriptFile` property is defined. Neither the host nor the worker needs it, but tooling like the portal may use it so we'll make a best guess
    // (The real script file may be a separate file referenced from the entry point, or it may be coming from a different entry point entirely if there are some async shenanigans)
    if (channel.currentEntryPoint) {
        rpcMetadata.scriptFile = path.basename(channel.currentEntryPoint);
        rpcMetadata.directory = path.dirname(channel.currentEntryPoint);
    } else {
        rpcMetadata.scriptFile = 'unknown';
    }

    channel.functions[functionId] = { metadata: rpcMetadata, callback };

    return new Disposable(() => {
        if (channel.workerIndexingLocked) {
            throw new AzFuncSystemError('A function can only be disposed during app startup.');
        } else {
            delete channel.functions[functionId];
        }
    });
}
