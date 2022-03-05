// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import path = require('path');

export function getPackageJson(appDir: string): Object {
    const packageJsonPath = path.join(appDir, '/package.json');
    return require(packageJsonPath);
}
