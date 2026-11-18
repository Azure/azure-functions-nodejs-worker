// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { trace } from '@opentelemetry/api';

/**
 * Called by first_http_function. Its traceparent header should share the
 * trace ID of the first function, showing distributed tracing across calls.
 */
export async function secondHttpFunction(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('TypeScript HTTP trigger function (second) processed a request.');
    context.log(`Header traceparent: "${request.headers.get('traceparent')}"`);
    context.log(`Context traceparent: "${context.traceContext?.traceParent}"`);
    context.log(`Active span: ${JSON.stringify(trace.getActiveSpan()?.spanContext() ?? null)}`);

    return { body: 'This is the second function responding.' };
}

app.http('second_http_function', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: secondHttpFunction,
});
