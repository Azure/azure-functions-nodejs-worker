// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { app } from '@azure/functions';
import { context, trace } from '@opentelemetry/api';

app.http('esm', {
    authLevel: 'anonymous',
    handler: async () => {
        await Promise.resolve();
        return { jsonBody: { traceId: trace.getSpanContext(context.active())?.traceId, esm: true } };
    },
});
