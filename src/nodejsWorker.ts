var logPrefix = "LanguageWorkerConsoleLog";
var worker;
try {
    worker = require("../../worker-bundle.js");
} catch (err) {
    console.error(`${logPrefix}Couldn't require bundle, falling back to Worker.js. ${err}`);
    worker = require("./Worker.js");
}

worker.startNodeWorker(process.argv);