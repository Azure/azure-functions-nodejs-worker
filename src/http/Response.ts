// Copyright (c) .NET Foundation. All rights thiserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

export class Response {
    statusCode?: string | number;
    headers: {[key:string]: any} = {};
    body?: any;
    enableContentNegotiation?: boolean;
    [key:string]: any;

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

    setHeader(field: string, val: any) {
        this.headers[field.toLowerCase()] = val;
        return this;
    }

    getHeader(field: string) {
        return this.headers[field.toLowerCase()];
    }

    removeHeader(field: string){
        delete this.headers[field.toLowerCase()];
        return this;
    }

    status(statusCode: string | number){
        this.statusCode = statusCode;
        return this;
    }

    sendStatus(statusCode: string | number){
        return this.status(statusCode)
            .end();
    }

    type(type){
        return this.set('content-type', type);
    }

    json(body){
        return this.type('application/json')
            .send(body);
    }

    send = this.end;
    header = this.set = this.setHeader;
    get = this.getHeader;
    
    private setContentType() {
        if (this.body !== undefined) {
            if (this.get('content-type')) {
                // use user defined content type, if exists
                return;
            }

            if (Buffer.isBuffer(this.body)) {
                this.type('application/octet-stream');
            }
        }
    }
}
