// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import * as cp from 'child_process';
import 'mocha';
import { Context } from 'mocha';
import * as path from 'path';

describe('Public TypeScript types', () => {
    for (const tsVersion of ['3', '4']) {
        it(`builds with TypeScript v${tsVersion}`, async function (this: Context) {
            this.timeout(10 * 1000);
            expect(await runTsBuild(tsVersion)).to.equal(0);
        });
    }
});

async function runTsBuild(tsVersion: string): Promise<number> {
    const repoRoot = path.join(__dirname, '..', '..');
    const tscPath = path.join(repoRoot, 'node_modules', `typescript${tsVersion}`, 'bin', 'tsc');
    const projectFile = path.join(repoRoot, 'types', 'tsconfig.json');
    return new Promise<number>((resolve, reject) => {
        const cmd = cp.spawn('node', [tscPath, '--project', projectFile]);
        cmd.stdout.on('data', function (data) {
            console.log(data.toString());
        });
        cmd.stderr.on('data', function (data) {
            console.error(data.toString());
        });
        cmd.on('error', reject);
        cmd.on('close', resolve);
    });
}
