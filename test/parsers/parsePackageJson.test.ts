// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as chai from 'chai';
import { expect } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import 'mocha';
import * as mockFs from 'mock-fs';
import { parsePackageJson } from '../../src/parsers/parsePackageJson';
chai.use(chaiAsPromised);

describe('parsePackageJson', () => {
    const testDir = 'testDir';

    afterEach(async () => {
        mockFs.restore();
    });

    it('normal', async () => {
        mockFs({ [testDir]: { 'package.json': '{ "main": "index.js", "type": "commonjs" }' } });
        await expect(parsePackageJson(testDir)).to.eventually.deep.equal({ main: 'index.js', type: 'commonjs' });
    });

    it('invalid type', async () => {
        mockFs({ [testDir]: { 'package.json': '{ "main": "index.js", "type": {} }' } });
        await expect(parsePackageJson(testDir)).to.eventually.deep.equal({ main: 'index.js' });
    });

    it('invalid main', async () => {
        mockFs({ [testDir]: { 'package.json': '{ "main": 55, "type": "commonjs" }' } });
        await expect(parsePackageJson(testDir)).to.eventually.deep.equal({ type: 'commonjs' });
    });

    it('missing file', async () => {
        await expect(parsePackageJson(testDir)).to.be.rejectedWith('file does not exist');
    });

    it('empty', async () => {
        mockFs({ [testDir]: { 'package.json': '' } });
        await expect(parsePackageJson(testDir)).to.be.rejectedWith(/^file content is not valid JSON:/);
    });

    it('missing bracket', async () => {
        mockFs({ [testDir]: { 'package.json': '{' } });
        await expect(parsePackageJson(testDir)).to.be.rejectedWith(/^file content is not valid JSON:/);
    });

    it('null', async () => {
        mockFs({ [testDir]: { 'package.json': 'null' } });
        await expect(parsePackageJson(testDir)).to.be.rejectedWith('file content is not an object');
    });

    it('array', async () => {
        mockFs({ [testDir]: { 'package.json': '[]' } });
        await expect(parsePackageJson(testDir)).to.be.rejectedWith('file content is not an object');
    });
});
