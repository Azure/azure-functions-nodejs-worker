// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { NODE_EOL_DATES, NODE_EOL_WARNING_DATES } from './constants';

const logPrefix = 'LanguageWorkerConsoleLog';
const errorPrefix = logPrefix + '[error] ';
const warnPrefix = logPrefix + '[warn] ';
const upgradeUrl = 'https://aka.ms/functions-node-versions';
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
        const today = currentYearMonth();

        const warningDateStr = NODE_EOL_WARNING_DATES[major];
        const eolDateStr = NODE_EOL_DATES[major];

        if (!warningDateStr || !eolDateStr) {
            const msg = `Node.js ${major} version is not officially supported. Please change to a supported version: ${upgradeUrl}`;
            console.warn(warnPrefix + msg);
        } else if (today >= eolDateStr) {
            const msg = `Node.js ${major} reached EOL on ${eolDateStr}. Please upgrade to a supported version: ${upgradeUrl}`;
            console.error(errorPrefix + msg);
        } else if (today >= warningDateStr) {
            const msg = `Node.js ${major} will reach EOL on ${eolDateStr}. Consider upgrading: ${upgradeUrl}`;
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
