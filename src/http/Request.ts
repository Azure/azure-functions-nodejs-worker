// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { FormPart, HttpMethod, HttpRequest, ParseFormBodyOptions } from '@azure/functions';
import { Readable } from 'stream';
import { getFormBoundary } from '../form-data/parseContentType';
import { parseForm } from '../form-data/parseForm';

export class RequestProperties implements Partial<HttpRequest> {
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

export class Request extends RequestProperties implements HttpRequest {
    constructor(httpInput: RequestProperties) {
        super();
        Object.assign(this, httpInput);
    }
    get(field: string): string | undefined {
        return this.headers && this.headers[field.toLowerCase()];
    }

    public parseFormBody(options?: ParseFormBodyOptions): Promise<FormPart[]> {
        const contentType = this.get('content-type');
        if (!contentType) {
            throw new Error('todo');
        }

        const boundary = getFormBoundary(contentType);
        return parseForm(Readable.from(this.body), boundary, options);
    }
}
