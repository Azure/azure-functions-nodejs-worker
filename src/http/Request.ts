// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import {
    HttpMethod,
    HttpRequest,
    HttpRequestHeaders,
    HttpRequestParams,
    HttpRequestQuery,
    HttpRequestUser,
} from '@azure/functions';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { fromTypedData } from '../converters/RpcConverters';
import { fromNullableMapping, fromRpcHttpBody } from '../converters/RpcHttpConverters';

export class Request implements HttpRequest {
    public method: HttpMethod | null;
    public url: string;
    public originalUrl: string;
    public headers: HttpRequestHeaders;
    public query: HttpRequestQuery;
    public params: HttpRequestParams;
    public body?: any;
    public rawBody?: any;

    private _cachedUser?: HttpRequestUser | null;

    public constructor(rpcHttp: rpc.IRpcHttp) {
        this.method = <HttpMethod>rpcHttp.method;
        this.url = <string>rpcHttp.url;
        this.originalUrl = <string>rpcHttp.url;
        this.headers = fromNullableMapping(rpcHttp.nullableHeaders, rpcHttp.headers);
        this.query = fromNullableMapping(rpcHttp.nullableQuery, rpcHttp.query);
        this.params = fromNullableMapping(rpcHttp.nullableParams, rpcHttp.params);
        this.body = fromTypedData(<rpc.ITypedData>rpcHttp.body);
        this.rawBody = fromRpcHttpBody(<rpc.ITypedData>rpcHttp.body);
    }

    public get user(): HttpRequestUser | null {
        if (this._cachedUser === undefined) {
            if (this.headers['x-ms-client-principal']) {
                const claimsPrincipalData = JSON.parse(
                    Buffer.from(this.headers['x-ms-client-principal'], 'base64').toString('utf-8')
                );

                if (claimsPrincipalData['identityProvider']) {
                    this._cachedUser = {
                        type: 'StaticWebApps',
                        id: claimsPrincipalData['userId'],
                        username: claimsPrincipalData['userDetails'],
                        identityProvider: claimsPrincipalData['identityProvider'],
                        claimsPrincipalData,
                    };
                } else {
                    this._cachedUser = {
                        type: 'AppService',
                        id: this.headers['x-ms-client-principal-id'],
                        username: this.headers['x-ms-client-principal-name'],
                        identityProvider: this.headers['x-ms-client-principal-idp'],
                        claimsPrincipalData,
                    };
                }
            } else {
                this._cachedUser = null;
            }
        }

        return this._cachedUser;
    }

    public get(field: string): string | undefined {
        return this.headers && this.headers[field.toLowerCase()];
    }
}
