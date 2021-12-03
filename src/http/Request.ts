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
import { extractHttpUserFromHeaders } from './ExtractHttpUser';

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
            this._cachedUser = extractHttpUserFromHeaders(this.headers);
        }

        return this._cachedUser;
    }

    public get(field: string): string | undefined {
        return this.headers && this.headers[field.toLowerCase()];
    }
}
