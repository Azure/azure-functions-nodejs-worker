// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

const logPrefix = 'LanguageWorkerConsoleLog';
const errorPrefix = logPrefix + '[error] ';
const warnPrefix = logPrefix + '[warn] ';
const supportedVersions: string[] = ['v14', 'v16'];
const devOnlyVersions: string[] = ['v15', 'v17', 'v18'];
let worker;

// Try validating node version
// NOTE: This method should be manually tested if changed as it is in a sensitive code path
//       and is JavaScript that runs on at least node version 0.10.28
function validateNodeVersion(version: string) {
    let errorMessage: string | undefined;
    let warningMessage: string | undefined;
    try {
        const versionSplit = version.split('.');
        const major = versionSplit[0];
        // process.version returns invalid output
        if (versionSplit.length != 3) {
            errorMessage = "Could not parse Node.js version: '" + version + "'";
            // Unsupported version note: Documentation about Node's stable versions here: https://github.com/nodejs/Release#release-plan and an explanation here: https://medium.com/swlh/understanding-how-node-releases-work-in-2018-6fd356816db4
        } else if (process.env.AZURE_FUNCTIONS_ENVIRONMENT == 'Development' && devOnlyVersions.indexOf(major) >= 0) {
            warningMessage =
                'Node.js version used (' +
                version +
                ') is not officially supported. You may use it during local development, but must use an officially supported version on Azure:' +
                ' https://aka.ms/functions-node-versions';
        } else if (supportedVersions.indexOf(major) < 0) {
            errorMessage =
                'Incompatible Node.js version' +
                ' (' +
                version +
                ').' +
                ' Refer to our documentation to see the Node.js versions supported by each version of Azure Functions: https://aka.ms/functions-node-versions';
        }
        // Unknown error
    } catch (err) {
        const unknownError = 'Error in validating Node.js version. ';
        console.error(errorPrefix + unknownError + err);
        throw unknownError + err;
    }
    // Throw error for known version errors
    if (errorMessage) {
        console.error(errorPrefix + errorMessage);
        throw new Error(errorMessage);
    }
    if (warningMessage) {
        console.warn(warnPrefix + warningMessage);
    }
}

validateNodeVersion(process.version);

// Try requiring bundle
try {
    worker = require('./worker-bundle.js');
    worker = worker.worker;
} catch (err) {
    console.log(logPrefix + "Couldn't require bundle, falling back to Worker.js. " + err);
    worker = require('./Worker.js');
}

worker.startNodeWorker(process.argv);
