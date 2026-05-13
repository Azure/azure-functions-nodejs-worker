// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

'use strict';

module.exports = inquire;

function inquire(moduleName) {
    try {
        const requireFunc = eval('require'); // eslint-disable-line no-eval
        const mod = requireFunc(moduleName);
        if (mod && (mod.length || Object.keys(mod).length)) {
            return mod;
        }
    } catch (_error) {
        // Optional dependency is not available.
    }

    return null;
}
