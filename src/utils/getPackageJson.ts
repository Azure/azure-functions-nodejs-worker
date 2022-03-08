// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import path = require('path');
import { PackageJson } from '@azure/functions';
import { access } from 'fs';
import { promisify } from 'util';

const accessAsync = promisify(access);

export async function getPackageJson(appDir: string): Promise<PackageJson> {
    const packageJsonPath = path.join(appDir, 'package.json');
    try {
        await accessAsync(packageJsonPath);
        return require(packageJsonPath);
    } catch {
        return {};
    }
}
