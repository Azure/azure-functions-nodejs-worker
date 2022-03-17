// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { Context } from '@azure/functions';
import { readJson } from 'fs-extra';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { IFunctionLoader } from './FunctionLoader';
import { IEventStream } from './GrpcClient';
import { ensureErrorType } from './utils/ensureErrorType';
import path = require('path');
import LogLevel = rpc.RpcLog.Level;
import LogCategory = rpc.RpcLog.RpcLogCategory;

type InvocationRequestBefore = (context: Context, userFn: Function) => Function;
type InvocationRequestAfter = (context: Context) => void;

export interface PackageJson {
    type?: string;
}

export class WorkerChannel {
    public eventStream: IEventStream;
    public functionLoader: IFunctionLoader;
    public packageJson: PackageJson;
    private _invocationRequestBefore: InvocationRequestBefore[];
    private _invocationRequestAfter: InvocationRequestAfter[];

    constructor(eventStream: IEventStream, functionLoader: IFunctionLoader) {
        this.eventStream = eventStream;
        this.functionLoader = functionLoader;
        this.packageJson = {};
        this._invocationRequestBefore = [];
        this._invocationRequestAfter = [];
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

    /**
     * Register a patching function to be run before User Function is executed.
     * Hook should return a patched version of User Function.
     */
    public registerBeforeInvocationRequest(beforeCb: InvocationRequestBefore): void {
        this._invocationRequestBefore.push(beforeCb);
    }

    /**
     * Register a function to be run after User Function resolves.
     */
    public registerAfterInvocationRequest(afterCb: InvocationRequestAfter): void {
        this._invocationRequestAfter.push(afterCb);
    }

    public runInvocationRequestBefore(context: Context, userFunction: Function): Function {
        let wrappedFunction = userFunction;
        for (const before of this._invocationRequestBefore) {
            wrappedFunction = before(context, wrappedFunction);
        }
        return wrappedFunction;
    }

    public runInvocationRequestAfter(context: Context) {
        for (const after of this._invocationRequestAfter) {
            after(context);
        }
    }

    public async updatePackageJson(dir: string): Promise<void> {
        try {
            this.packageJson = await readJson(path.join(dir, 'package.json'));
        } catch (err) {
            const error: Error = ensureErrorType(err);
            let errorMsg: string;
            if (error.name === 'SyntaxError') {
                errorMsg = `file is not a valid JSON: ${error.message}`;
            } else if (error.message.startsWith('ENOENT')) {
                errorMsg = `file does not exist.`;
            } else {
                errorMsg = error.message;
            }
            errorMsg = `Worker failed to load package.json: ${errorMsg}`;
            this.log({
                message: errorMsg,
                level: LogLevel.Warning,
                logCategory: LogCategory.System,
            });
            this.packageJson = {};
        }
    }
}
