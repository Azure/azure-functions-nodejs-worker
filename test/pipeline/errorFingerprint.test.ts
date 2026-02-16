// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import { generateErrorFingerprint, isSameError } from '../../src/pipeline/errorFingerprint';

describe('errorFingerprint', () => {
    describe('generateErrorFingerprint', () => {
        it('should return a 16-character hex string', () => {
            const fp = generateErrorFingerprint('Something went wrong');
            expect(fp).to.be.a('string');
            expect(fp).to.have.lengthOf(16);
            expect(fp).to.match(/^[0-9a-f]{16}$/);
        });

        it('should produce stable fingerprints for the same message', () => {
            const fp1 = generateErrorFingerprint('Connection refused');
            const fp2 = generateErrorFingerprint('Connection refused');
            expect(fp1).to.equal(fp2);
        });

        it('should produce different fingerprints for different messages', () => {
            const fp1 = generateErrorFingerprint('Connection refused');
            const fp2 = generateErrorFingerprint('Timeout expired');
            expect(fp1).to.not.equal(fp2);
        });

        it('should normalize numbers so port differences do not affect fingerprint', () => {
            const fp1 = generateErrorFingerprint('Connection refused on port 3000');
            const fp2 = generateErrorFingerprint('Connection refused on port 8080');
            expect(fp1).to.equal(fp2);
        });

        it('should normalize UUIDs', () => {
            const fp1 = generateErrorFingerprint('Failed to process request 550e8400-e29b-41d4-a716-446655440000');
            const fp2 = generateErrorFingerprint('Failed to process request a1b2c3d4-e5f6-7890-abcd-ef1234567890');
            expect(fp1).to.equal(fp2);
        });

        it('should normalize file paths', () => {
            const fp1 = generateErrorFingerprint('Error in /home/user/app/server.js');
            const fp2 = generateErrorFingerprint('Error in /var/lib/app/server.js');
            expect(fp1).to.equal(fp2);
        });

        it('should include stack trace in fingerprint when provided', () => {
            const fpNoStack = generateErrorFingerprint('Error occurred');
            const fpWithStack = generateErrorFingerprint(
                'Error occurred',
                'at myFunc (file.js:10:5)\nat main (index.js:1:1)'
            );
            expect(fpNoStack).to.not.equal(fpWithStack);
        });
    });

    describe('isSameError', () => {
        it('should return true for identical errors', () => {
            expect(isSameError('Error A', undefined, 'Error A', undefined)).to.be.true;
        });

        it('should return false for different errors', () => {
            expect(isSameError('Error A', undefined, 'Error B', undefined)).to.be.false;
        });
    });
});
