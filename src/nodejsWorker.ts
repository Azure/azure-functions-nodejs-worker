// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { NODE_EOL_DATES, NODE_EOL_WARNING_DATES } from './constants';

const logPrefix = 'LanguageWorkerConsoleLog';
const errorPrefix = logPrefix + '[error] ';
const warnPrefix = logPrefix + '[warn] ';
let workerModule;

function currentYearMonth(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Try validating node version
// NOTE: This method should be manually tested if changed as it is in a sensitive code path
//       and is JavaScript that runs on at least node version 0.10.28
function validateNodeVersion(version: string) {
    try {
        const major = version.split('.')[0]; // e.g. "v18"
        console.warn('Major: ' + major);
        const today = currentYearMonth();

        const warningDateStr = NODE_EOL_WARNING_DATES[major];
        const eolDateStr = NODE_EOL_DATES[major];

        if (!warningDateStr || !eolDateStr) {
            const msg = `Unknown Node.js version: ${version}`;
            console.warn(warnPrefix + msg);
            return;
        }

        if (today >= eolDateStr) {
            const msg = `Node.js ${major} reached EOL on ${eolDateStr}. Please upgrade to a supported version: https://aka.ms/functions-node-versions`;
            console.error(errorPrefix + msg);
        } else if (today >= warningDateStr) {
            const msg = `Node.js ${major} will reach EOL on ${eolDateStr}. Consider upgrading: https://aka.ms/functions-node-versions`;
            console.warn(warnPrefix + msg);
        }
    } catch (err) {
        const unknownError = 'Error validating Node.js version. ';
        console.error(errorPrefix + unknownError + err);
        throw err;
    }
}

validateNodeVersion(process.version);

// Try requiring bundle
try {
    workerModule = require('./worker-bundle.js');
    workerModule = workerModule.worker;
} catch (err) {
    console.log(logPrefix + "Couldn't require bundle, falling back to Worker.js. " + err);
    workerModule = require('./Worker.js');
}

workerModule.startNodeWorker(process.argv);
