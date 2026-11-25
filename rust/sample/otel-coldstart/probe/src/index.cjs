// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

'use strict';

const { app } = require('@azure/functions');
const { measureRound, readTargets } = require('./measure.cjs');

app.timer('coldStartProbe', {
    schedule: process.env.PROBE_SCHEDULE ?? '0 */30 * * * *',
    runOnStartup: false,
    useMonitor: true,
    handler: async (timer, context) => {
        const results = await measureRound(readTargets(process.env), context, timer.isPastDue);
        if (results.some((result) => !result.success)) {
            throw new Error('otel-coldstart: one or more probes failed; see measurement logs.');
        }
    },
});
