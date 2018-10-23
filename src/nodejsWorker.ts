var logPrefix = "LanguageWorkerConsoleLog";
var errorPrefix = logPrefix + "[error] ";
var ACTIVE_LTS_VERSION = "v8";
var CURRENT_BRANCH_VERSION = "v10";
var worker;

// Try validating node version
// NOTE: This method should be manually tested if changed as it is in a sensitive code path 
//       and is JavaScript that runs on at least node version 0.10.28
function validateNodeVersion(version) {
    var message;
    try {
        var versionSplit = version.split(".");
        var major = versionSplit[0];
        // process.version returns invalid output
        if (versionSplit.length != 3){
            message = "Could not parse Node.js version: '" + version + "'";
        // Unsupported version
        } else if (major != ACTIVE_LTS_VERSION && major != CURRENT_BRANCH_VERSION) {
            message = "Node.js version is too low. The version you are using is "
                    + version +
                    ", but the runtime requires an Active LTS or Current version (ex: 8.11.1 or 10.6.0). "
                    + "For deployed code, change WEBSITE_NODE_DEFAULT_VERSION in App Settings. Locally, upgrade the node version used by your machine (make sure to quit and restart your code editor to pick up the changes).";
        }
    // Unknown error
    } catch(err) {
        var unknownError = "Error in validating Node.js version. ";
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
    worker = require("../../worker-bundle.js");
} catch (err) {
    console.log(logPrefix + "Couldn't require bundle, falling back to Worker.js. " + err);
    worker = require("./Worker.js");
}

worker.startNodeWorker(process.argv);