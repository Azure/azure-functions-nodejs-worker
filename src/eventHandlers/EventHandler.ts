// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';

export type SupportedRequestName =
    | 'functionEnvironmentReloadRequest'
    | 'functionLoadRequest'
    | 'invocationRequest'
    | 'workerInitRequest'
    | 'functionsMetadataRequest';
export type SupportedRequest = rpc.StreamingMessage[SupportedRequestName];

export type SupportedResponseName =
    | 'functionEnvironmentReloadResponse'
    | 'functionLoadResponse'
    | 'invocationResponse'
    | 'workerInitResponse'
    | 'functionMetadataResponse';
export type SupportedResponse = rpc.StreamingMessage[SupportedResponseName];

export abstract class EventHandler<
    TRequestName extends SupportedRequestName = SupportedRequestName,
    TResponseName extends SupportedResponseName = SupportedResponseName,
    TRequest = NonNullable<rpc.StreamingMessage[TRequestName]>,
    TResponse = NonNullable<rpc.StreamingMessage[TResponseName]>
> {
    abstract readonly responseName: TResponseName;

    /**
     * The default response with any properties unique to this request that should be set for both success & failure scenarios
     */
    abstract getDefaultResponse(request: TRequest): TResponse;

    /**
     * Handles the event and returns the response
     * NOTE: This method does not need to set the result/status. That will be handled in code common to all event handlers
     */
    abstract handleEvent(request: TRequest): Promise<TResponse>;
}
