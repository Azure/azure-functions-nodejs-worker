// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as fs from 'fs/promises';
import * as path from 'path';

const directory: string = path.resolve();

export const tempFile = 'temp.js';
export const testAppPath = path.join(directory, 'test/eventHandlers/testApp');
export const testAppSrcPath = path.join(testAppPath, 'src');
export const testPackageJsonPath = path.join(testAppPath, 'package.json');

export async function setTestAppMainField(fileName: string): Promise<string> {
    const fileSubpath = `src/${fileName}`;
    await fs.writeFile(testPackageJsonPath, JSON.stringify({ main: fileSubpath }));
    return fileSubpath;
}
