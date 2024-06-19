// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import 'mocha';
import { expect } from 'chai';
import { ensureErrorType, trySetErrorMessage } from '../src/errors';

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

    it('modify error message', () => {
        const actualError = new Error('test2');
        trySetErrorMessage(actualError, 'modified message');

        expect(actualError.message).to.equal('modified message');
    });

    it('readonly error', () => {
        class ReadOnlyError extends Error {
            get message(): string {
                return 'a readonly message';
            }
        }

        const actualError = new ReadOnlyError();

        // @ts-expect-error: create a function to test that writing throws an exception
        expect(() => (actualError.message = 'exception')).to.throw();

        const wrappedError = ensureErrorType(actualError);
        const message = 'Readonly error has not been modified';
        trySetErrorMessage(wrappedError, message);

        expect(wrappedError.message).to.equal('a readonly message');
        expect(wrappedError.stack).to.not.contain('Readonly error has been modified');
    });

    function validateError(actual: Error, expectedMessage: string): void {
        expect(actual).to.be.instanceof(Error);
        expect(actual.message).to.equal(expectedMessage);
    }
});
