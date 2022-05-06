// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as url from 'url';
import { PackageJson } from './parsers/parsePackageJson';
import { InternalException } from './utils/InternalException';

export async function loadScriptFile(filePath: string, packageJson: PackageJson): Promise<unknown> {
    let script: unknown;
    if (isESModule(filePath, packageJson)) {
        const fileUrl = url.pathToFileURL(filePath);
        if (fileUrl.href) {
            // use eval so it doesn't get compiled into a require()
            script = await eval('import(fileUrl.href)');
        } else {
            throw new InternalException(`'${filePath}' could not be converted to file URL (${fileUrl.href})`);
        }
    } else {
        script = require(/* webpackIgnore: true */ filePath);
    }
    return script;
}

export function isESModule(filePath: string, packageJson: PackageJson): boolean {
    if (filePath.endsWith('.mjs')) {
        return true;
    }
    if (filePath.endsWith('.cjs')) {
        return false;
    }
    return packageJson.type === 'module';
}
