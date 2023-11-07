// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import 'mocha';
import { expect } from 'chai';
import { isESModule } from '../src/loadScriptFile';

describe('loadScriptFile', () => {
    it('respects .cjs extension', () => {
        const result = isESModule('test.cjs', {
            type: 'module',
        });
        expect(result).to.be.false;
    });

    it('respects .mjs extension', () => {
        const result = isESModule('test.mjs', {
            type: 'commonjs',
        });
        expect(result).to.be.true;
    });

    it('respects package.json module type', () => {
        const result = isESModule('test.js', {
            type: 'module',
        });
        expect(result).to.be.true;
    });

    it('defaults to using commonjs', () => {
        expect(isESModule('test.js', {})).to.be.false;
        expect(
            isESModule('test.js', {
                type: 'commonjs',
            })
        ).to.be.false;
    });
});
