// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { pathExists, readJson } from 'fs-extra';
import * as path from 'path';
import { ensureErrorType } from '../utils/ensureErrorType';

export interface PackageJson {
    type?: string;
    main?: string;
}

/**
 * @returns A parsed & sanitized package.json
 */
export async function parsePackageJson(dir: string): Promise<PackageJson> {
    try {
        const filePath = path.join(dir, 'package.json');
        if (!(await pathExists(filePath))) {
            throw new Error('file does not exist');
        }

        const data: unknown = await readJson(filePath);
        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
            throw new Error('file content is not an object');
        }

        const stringFields = ['main', 'type'];
        for (const field of stringFields) {
            if (field in data && typeof data[field] !== 'string') {
                // ignore fields with an unexpected type
                delete data[field];
            }
        }
        return data;
    } catch (err) {
        const error: Error = ensureErrorType(err);
        if (error.name === 'SyntaxError') {
            error.message = `file content is not valid JSON: ${error.message}`;
        }
        throw error;
    }
}
