// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import 'mocha';
import { ensureErrorType } from '../src/errors';

describe('errors', () => {
    it('null', () => {
        validateError(ensureErrorType(null), 'Unknown error');
    });

    it('undefined', () => {
        validateError(ensureErrorType(undefined), 'Unknown error');
    });

    it('boolean', () => {
        validateError(ensureErrorType(true), 'true');
        validateError(ensureErrorType(false), 'false');
    });

    it('number', () => {
        validateError(ensureErrorType(5), '5');
    });

    it('string', () => {
        validateError(ensureErrorType('test'), 'test');
        validateError(ensureErrorType('    '), '    ');
        validateError(ensureErrorType(''), '');
    });

    it('object', () => {
        validateError(ensureErrorType({ test: '2' }), '{"test":"2"}');
    });

    it('array', () => {
        validateError(ensureErrorType([1, 2]), '[1,2]');
    });

    it('error', () => {
        const actualError = new Error('test2'); // Should return the original error instance, so don't use validateError which is more of a "deep" equal
        expect(ensureErrorType(actualError)).to.equal(actualError);
    });

    function validateError(actual: Error, expectedMessage: string): void {
        expect(actual).to.be.instanceof(Error);
        expect(actual.message).to.equal(expectedMessage);
    }
});
