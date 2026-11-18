// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { trace } from '@opentelemetry/api';
import axios from 'axios';

/**
 * Calls second_http_function over HTTP. The outgoing call produces a dns span
 * (resolving the host name) and an http client span under the invocation span.
 */
export async function firstHttpFunction(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('TypeScript HTTP trigger function (first) processed a request.');
    context.log(`Header traceparent: "${request.headers.get('traceparent')}"`);
    context.log(`Context traceparent: "${context.traceContext?.traceParent}"`);
    context.log(`Active span: ${JSON.stringify(trace.getActiveSpan()?.spanContext() ?? null)}`);

    try {
        const baseUrl = new URL(request.url).origin;
        const response = await axios.get(`${baseUrl}/api/second_http_function`);

        context.log('Successfully called second function');
        return {
            jsonBody: {
                message: 'Hello from the first function!',
                second_function_response: response.data,
            },
        };
    } catch (error) {
        context.error('Error occurred:', error);
        return { status: 500, jsonBody: { error: 'Failed to process request' } };
    }
}

app.http('first_http_function', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: firstHttpFunction,
});
