// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { HookCallback, HookContext } from '@azure/functions-worker';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { Disposable } from './Disposable';
import { IFunctionLoader } from './FunctionLoader';
import { IEventStream } from './GrpcClient';

export class WorkerChannel {
    public eventStream: IEventStream;
    public functionLoader: IFunctionLoader;
    private _preInvocationHooks: HookCallback[] = [];
    private _postInvocationHooks: HookCallback[] = [];

    constructor(eventStream: IEventStream, functionLoader: IFunctionLoader) {
        this.eventStream = eventStream;
        this.functionLoader = functionLoader;
    }

    /**
     * Captured logs or relevant details can use the logs property
     * @param requestId gRPC message request id
     * @param msg gRPC message content
     */
    public log(log: rpc.IRpcLog) {
        this.eventStream.write({
            rpcLog: log,
        });
    }

    public registerHook(hookName: string, callback: HookCallback): Disposable {
        const hooks = this.getHooks(hookName);
        hooks.push(callback);
        return new Disposable(() => {
            const index = hooks.indexOf(callback);
            if (index > -1) {
                hooks.splice(index, 1);
            }
        });
    }

    public async executeHooks(hookName: string, context: HookContext): Promise<void> {
        const callbacks = this.getHooks(hookName);
        for (const callback of callbacks) {
            await callback(context);
        }
    }

    private getHooks(hookName: string): HookCallback[] {
        switch (hookName) {
            case 'preInvocation':
                return this._preInvocationHooks;
            case 'postInvocation':
                return this._postInvocationHooks;
            default:
                throw new RangeError(`Unrecognized hook "${hookName}"`);
        }
    }
}
