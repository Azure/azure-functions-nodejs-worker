import { systemError } from './utils/Logger';
var worker;
try {
    worker = require("../../worker-bundle.js");
} catch (err) {
    systemError(`Couldn't require bundle, falling back to Worker.js. ${err}`);
    worker = require("./Worker.js");
}

worker.startNodeWorker(process.argv);