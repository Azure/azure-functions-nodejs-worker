// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.
import { HttpRequest, HttpMethod, ClaimsIdentity } from '../public/Interfaces';

export class RequestProperties implements HttpRequest {
    method: HttpMethod | null = null;
    url: string = "";
    originalUrl: string = "";
    headers: {[key:string]: string} = {};
    query: {[key:string]: string} = {};
    params: {[key:string]: string} = {};
    body?: any;
    rawbody?: any;
    user?: ClaimsIdentity[];
    [key:string]: any;
}

export class Request extends RequestProperties {
    constructor(httpInput: RequestProperties) {
        super();
        Object.assign(this, httpInput);
    }

    get(field: string): string | undefined {
        return this.headers && this.headers[field.toLowerCase()];
    }
}