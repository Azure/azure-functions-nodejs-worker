// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

export class HttpRequest {
    method: string;
    url: string;
    originalUrl: string;
    headers?: {[key:string]: string};
    query?: {[key:string]: string};
    params?: {[key:string]: string};
    body?: any;
    [key:string]: any;
}

export class Request extends HttpRequest {
    constructor(httpInput: HttpRequest) {
        super();
        Object.assign(this, httpInput);
    }

    get(field: string) {
        return this.headers && this.headers[field.toLowerCase()];
    }
}