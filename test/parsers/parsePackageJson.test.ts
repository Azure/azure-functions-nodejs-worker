// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import 'mocha';
import * as chai from 'chai';
import { expect } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { parsePackageJson } from '../../src/parsers/parsePackageJson';

chai.use(chaiAsPromised);

describe('parsePackageJson', () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = await mkdtemp(path.join(tmpdir(), 'parsePackageJson-'));
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    it('normal', async () => {
        await writePackageJson('{ "main": "index.js", "type": "commonjs" }');
        await expect(parsePackageJson(testDir)).to.eventually.deep.equal({ main: 'index.js', type: 'commonjs' });
    });

    it('invalid type', async () => {
        await writePackageJson('{ "main": "index.js", "type": {} }');
        await expect(parsePackageJson(testDir)).to.eventually.deep.equal({ main: 'index.js' });
    });

    it('invalid main', async () => {
        await writePackageJson('{ "main": 55, "type": "commonjs" }');
        await expect(parsePackageJson(testDir)).to.eventually.deep.equal({ type: 'commonjs' });
    });

    it('missing file', async () => {
        await expect(parsePackageJson(testDir)).to.be.rejectedWith('file does not exist');
    });

    it('empty', async () => {
        await writePackageJson('');
        await expect(parsePackageJson(testDir)).to.be.rejectedWith(/^file content is not valid JSON:/);
    });

    it('missing bracket', async () => {
        await writePackageJson('{');
        await expect(parsePackageJson(testDir)).to.be.rejectedWith(/^file content is not valid JSON:/);
    });

    it('null', async () => {
        await writePackageJson('null');
        await expect(parsePackageJson(testDir)).to.be.rejectedWith('file content is not an object');
    });

    it('array', async () => {
        await writePackageJson('[]');
        await expect(parsePackageJson(testDir)).to.be.rejectedWith('file content is not an object');
    });

    async function writePackageJson(contents: string): Promise<void> {
        await writeFile(path.join(testDir, 'package.json'), contents);
    }
});
