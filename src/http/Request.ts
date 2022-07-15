// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import {
    Form,
    HttpMethod,
    HttpRequest,
    HttpRequestHeaders,
    HttpRequestParams,
    HttpRequestQuery,
    HttpRequestUser,
} from '@azure/functions';
import { RpcHttpData, RpcTypedData } from '@azure/functions-core';
import { HeaderName } from '../constants';
import { fromTypedData } from '../converters/RpcConverters';
import { fromNullableMapping, fromRpcHttpBody } from '../converters/RpcHttpConverters';
import { parseForm } from '../parsers/parseForm';
import { extractHttpUserFromHeaders } from './extractHttpUserFromHeaders';

export class Request implements HttpRequest {
    method: HttpMethod | null;
    url: string;
    originalUrl: string;
    headers: HttpRequestHeaders;
    query: HttpRequestQuery;
    params: HttpRequestParams;
    body?: any;
    rawBody?: any;

    #cachedUser?: HttpRequestUser | null;

    constructor(rpcHttp: RpcHttpData) {
        this.method = <HttpMethod>rpcHttp.method;
        this.url = <string>rpcHttp.url;
        this.originalUrl = <string>rpcHttp.url;
        this.headers = fromNullableMapping(rpcHttp.nullableHeaders, rpcHttp.headers);
        this.query = fromNullableMapping(rpcHttp.nullableQuery, rpcHttp.query);
        this.params = fromNullableMapping(rpcHttp.nullableParams, rpcHttp.params);
        this.body = fromTypedData(<RpcTypedData>rpcHttp.body);
        this.rawBody = fromRpcHttpBody(<RpcTypedData>rpcHttp.body);
    }

    get user(): HttpRequestUser | null {
        if (this.#cachedUser === undefined) {
            this.#cachedUser = extractHttpUserFromHeaders(this.headers);
        }

        return this.#cachedUser;
    }

    get(field: string): string | undefined {
        return this.headers && this.headers[field.toLowerCase()];
    }

    parseFormBody(): Form {
        const contentType = this.get(HeaderName.contentType);
        if (!contentType) {
            throw new Error(`"${HeaderName.contentType}" header must be defined.`);
        } else {
            return parseForm(this.body, contentType);
        }
    }
}
