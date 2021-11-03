// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { HttpMethod, HttpRequest } from '@azure/functions';

export class RequestProperties implements HttpRequest {
    method: HttpMethod | null = null;
    url = '';
    originalUrl = '';
    headers: { [key: string]: string } = {};
    query: { [key: string]: string } = {};
    params: { [key: string]: string } = {};
    body?: any;
    rawBody?: any;
    [key: string]: any;
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
