// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { ProgrammingModel } from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { AppContext } from './AppContext';
import { IEventStream } from './GrpcClient';
import { AzFuncSystemError } from './errors';

class WorkerContext {
    app = new AppContext();
    defaultProgrammingModel?: ProgrammingModel;

    /**
     * This will only be set after worker init request is received
     */
    _hostVersion?: string;

    #id?: string;
    #eventStream?: IEventStream;
    #notInitializedMsg = 'WorkerContext has not been initialized yet.';

    get id(): string {
        if (!this.#id) {
            throw new AzFuncSystemError(this.#notInitializedMsg);
        } else {
            return this.#id;
        }
    }

    set id(value: string) {
        this.#id = value;
    }

    get eventStream(): IEventStream {
        if (!this.#eventStream) {
            throw new AzFuncSystemError(this.#notInitializedMsg);
        } else {
            return this.#eventStream;
        }
    }

    set eventStream(value: IEventStream) {
        this.#eventStream = value;
    }

    get hostVersion(): string {
        if (!this._hostVersion) {
            throw new AzFuncSystemError('Cannot access hostVersion before worker init');
        } else {
            return this._hostVersion;
        }
    }

    resetApp(): void {
        this.app = new AppContext();
        this.app.programmingModel = this.defaultProgrammingModel;
    }

    /**
     * Captured logs or relevant details can use the logs property
     * @param requestId gRPC message request id
     * @param msg gRPC message content
     */
    log(log: rpc.IRpcLog) {
        this.eventStream.write({
            rpcLog: log,
        });
    }
}

export const worker = new WorkerContext();
