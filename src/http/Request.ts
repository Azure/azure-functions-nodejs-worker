// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.
import { IRequest } from '../public/Interfaces';

export class HttpRequest {
    method: string = "";
    url: string = "";
    originalUrl: string = "";
    headers?: {[key:string]: string};
    query?: {[key:string]: string};
    params?: {[key:string]: string};
    body?: any;
    rawbody?: any;
    [key:string]: any;
}

export class Request extends HttpRequest implements IRequest {
    constructor(httpInput: HttpRequest) {
        super();
        Object.assign(this, httpInput);
    }

    get(field: string): string | undefined {
        return this.headers && this.headers[field.toLowerCase()];
    }
}