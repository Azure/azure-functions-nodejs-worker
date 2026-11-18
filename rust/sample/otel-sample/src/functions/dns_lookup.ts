// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { promises as dns } from 'node:dns';

/**
 * Resolves a host name directly so the dns instrumentation emits a dns.lookup span
 * without any outgoing HTTP call.
 */
export async function dnsLookup(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const hostname = request.query.get('host') || 'microsoft.com';
    const { address, family } = await dns.lookup(hostname);
    context.log(`Resolved ${hostname} to ${address} (IPv${family})`);
    return { jsonBody: { hostname, address, family } };
}

app.http('dns_lookup', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: dnsLookup,
});
