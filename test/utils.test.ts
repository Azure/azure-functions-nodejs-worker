// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import 'mocha';
import { expect } from 'chai';
import { getNodeVersionLog } from '../src/utils/util';

describe('utils', () => {
    describe('getNodeVersionLog', () => {
        it('recognizes Node.js v26 as a known version', () => {
            const result = getNodeVersionLog('v26.0.0');

            expect(result?.message ?? '').to.not.contain('Incompatible Node.js version v26');
        });

        it('warns for unknown Node.js versions', () => {
            const result = getNodeVersionLog('v27.0.0');

            expect(result?.message).to.contain('Incompatible Node.js version v27');
        });
    });
});
