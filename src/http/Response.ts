// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { Cookie, HttpResponseApi } from '@azure/functions';
import { HeaderName, MediaType } from '../constants';

export class Response implements HttpResponseApi {
    statusCode?: string | number;
    headers: { [key: string]: any } = {};
    cookies: Cookie[] = [];
    body?: any;
    enableContentNegotiation?: boolean;
    [key: string]: any;

    private _done: Function;

    constructor(done: Function) {
        this._done = done;
    }

    end(body?: any) {
        if (body !== undefined) {
            this.body = body;
        }
        this.setContentType();
        this._done();
        return this;
    }

    setHeader(field: string, val: any): HttpResponseApi {
        this.headers[field.toLowerCase()] = val;
        return this;
    }

    getHeader(field: string): any {
        return this.headers[field.toLowerCase()];
    }

    removeHeader(field: string) {
        delete this.headers[field.toLowerCase()];
        return this;
    }

    status(statusCode: string | number): HttpResponseApi {
        this.statusCode = statusCode;
        return this;
    }

    sendStatus(statusCode: string | number) {
        this.status(statusCode);
        return this.end();
    }

    type(type) {
        return this.set(HeaderName.contentType, type);
    }

    json(body) {
        this.type(MediaType.json);
        this.send(body);
        return;
    }

    send = this.end;
    header = this.setHeader;
    set = this.setHeader;
    get = this.getHeader;

    private setContentType() {
        if (this.body !== undefined) {
            if (this.get(HeaderName.contentType)) {
                // use user defined content type, if exists
                return;
            }

            if (Buffer.isBuffer(this.body)) {
                this.type(MediaType.octetStream);
            }
        }
    }
}
