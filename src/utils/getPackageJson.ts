// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import path = require('path');
import { PackageJson } from '@azure/functions';
import { readJson } from 'fs-extra';

export async function getPackageJson(appDir: string): Promise<PackageJson> {
    try {
        return await readJson(path.join(appDir, 'package.json'));
    } catch {
        return {};
    }
}
