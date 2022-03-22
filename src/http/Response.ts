// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { Cookie, HttpResponseFull } from '@azure/functions';
import { HeaderName, MediaType } from '../constants';

export class Response implements HttpResponseFull {
    statusCode?: string | number;
    headers: { [key: string]: any } = {};
    cookies: Cookie[] = [];
    body?: any;
    enableContentNegotiation?: boolean;
    [key: string]: any;

    // NOTE: This is considered private and people should not be referencing it, but for the sake of backwards compatibility we will avoid using `#`
    _done: Function;

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

    setHeader(field: string, val: any): HttpResponseFull {
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

    status(statusCode: string | number): HttpResponseFull {
        this.statusCode = statusCode;
        return this;
    }

    sendStatus(statusCode: string | number) {
        this.status(statusCode);
        // eslint-disable-next-line deprecation/deprecation
        return this.end();
    }

    type(type) {
        return this.set(HeaderName.contentType, type);
    }

    json(body) {
        this.type(MediaType.json);
        // eslint-disable-next-line deprecation/deprecation
        this.send(body);
        return;
    }

    send = this.end;
    header = this.setHeader;
    set = this.setHeader;
    get = this.getHeader;

    // NOTE: This is considered private and people should not be referencing it, but for the sake of backwards compatibility we will avoid using `#`
    setContentType() {
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
