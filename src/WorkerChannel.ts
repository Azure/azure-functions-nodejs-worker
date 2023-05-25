// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { ProgrammingModel } from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { AppContext } from './AppContext';
import { IEventStream } from './GrpcClient';
import { AzFuncSystemError } from './errors';

export class WorkerChannel {
    app = new AppContext();
    defaultProgrammingModel?: ProgrammingModel;

    /**
     * This will only be set after worker init request is received
     */
    _hostVersion?: string;

    #workerId?: string;
    #eventStream?: IEventStream;
    #notInitializedMsg = 'WorkerChannel has not been initialized yet.';

    get workerId(): string {
        if (!this.#workerId) {
            throw new AzFuncSystemError(this.#notInitializedMsg);
        } else {
            return this.#workerId;
        }
    }

    set workerId(value: string) {
        this.#workerId = value;
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

export const channel: WorkerChannel = new WorkerChannel();
