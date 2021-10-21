const logPrefix = 'LanguageWorkerConsoleLog';
const errorPrefix = logPrefix + '[error] ';
const warnPrefix = logPrefix + '[warn] ';
const supportedVersions: string[] = ['v14', 'v16'];
let worker;

// Try validating node version
// NOTE: This method should be manually tested if changed as it is in a sensitive code path
//       and is JavaScript that runs on at least node version 0.10.28
function validateNodeVersion(version) {
    let message;
    try {
        const versionSplit = version.split('.');
        const major = versionSplit[0];
        // process.version returns invalid output
        if (versionSplit.length != 3) {
            message = "Could not parse Node.js version: '" + version + "'";
            // Unsupported version note: Documentation about Node's stable versions here: https://github.com/nodejs/Release#release-plan and an explanation here: https://medium.com/swlh/understanding-how-node-releases-work-in-2018-6fd356816db4
        } else if (supportedVersions.indexOf(major) < 0) {
            message =
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
    if (message) {
        console.error(errorPrefix + message);
        throw message;
    }
}

validateNodeVersion(process.version);

// Try requiring bundle
try {
    worker = require('../../worker-bundle.js');
    worker = worker.worker;
} catch (err) {
    console.log(logPrefix + "Couldn't require bundle, falling back to Worker.js. " + err);
    worker = require('./Worker.js');
}

worker.startNodeWorker(process.argv);
