// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { logPrefix } from './constants';

let workerModule;

// Try requiring bundle
try {
    workerModule = require('./worker-bundle.js');
    workerModule = workerModule.worker;
} catch (err) {
    console.log(logPrefix + "Couldn't require bundle, falling back to Worker.js. " + err);
    workerModule = require('./Worker.js');
}

workerModule.startNodeWorker(process.argv);
