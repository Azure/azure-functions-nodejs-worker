// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import 'mocha';
import { expect } from 'chai';
import { isEnvironmentVariableSet } from '../src/utils/util';

describe('isEnvironmentVariableSet', () => {
    // Truthy values - should return true
    it('returns true for "true"', () => {
        expect(isEnvironmentVariableSet('true')).to.be.true;
    });

    it('returns true for "TRUE"', () => {
        expect(isEnvironmentVariableSet('TRUE')).to.be.true;
    });

    it('returns true for "True"', () => {
        expect(isEnvironmentVariableSet('True')).to.be.true;
    });

    it('returns true for "1"', () => {
        expect(isEnvironmentVariableSet('1')).to.be.true;
    });

    it('returns true for numeric 1', () => {
        expect(isEnvironmentVariableSet(1)).to.be.true;
    });

    it('returns true for boolean true', () => {
        expect(isEnvironmentVariableSet(true)).to.be.true;
    });

    it('returns true for arbitrary non-empty string', () => {
        expect(isEnvironmentVariableSet('yes')).to.be.true;
        expect(isEnvironmentVariableSet('enabled')).to.be.true;
        expect(isEnvironmentVariableSet('anything')).to.be.true;
    });

    it('returns true for numeric values other than 0', () => {
        expect(isEnvironmentVariableSet(42)).to.be.true;
        expect(isEnvironmentVariableSet(-1)).to.be.true;
    });

    // Falsy values - should return false
    it('returns false for undefined', () => {
        expect(isEnvironmentVariableSet(undefined)).to.be.false;
    });

    it('returns false for null', () => {
        expect(isEnvironmentVariableSet(null)).to.be.false;
    });

    it('returns false for empty string', () => {
        expect(isEnvironmentVariableSet('')).to.be.false;
    });

    it('returns false for "false"', () => {
        expect(isEnvironmentVariableSet('false')).to.be.false;
    });

    it('returns false for "FALSE"', () => {
        expect(isEnvironmentVariableSet('FALSE')).to.be.false;
    });

    it('returns false for "False"', () => {
        expect(isEnvironmentVariableSet('False')).to.be.false;
    });

    it('returns false for "0"', () => {
        expect(isEnvironmentVariableSet('0')).to.be.false;
    });

    it('returns false for numeric 0', () => {
        expect(isEnvironmentVariableSet(0)).to.be.false;
    });

    it('returns false for boolean false', () => {
        expect(isEnvironmentVariableSet(false)).to.be.false;
    });

    // Integration with process.env
    describe('with process.env', () => {
        const testEnvKey = 'TEST_IS_ENV_VAR_SET';

        afterEach(() => {
            delete process.env[testEnvKey];
        });

        it('returns true when env var is set to "true"', () => {
            process.env[testEnvKey] = 'true';
            expect(isEnvironmentVariableSet(process.env[testEnvKey])).to.be.true;
        });

        it('returns true when env var is set to "1"', () => {
            process.env[testEnvKey] = '1';
            expect(isEnvironmentVariableSet(process.env[testEnvKey])).to.be.true;
        });

        it('returns false when env var is not set', () => {
            expect(isEnvironmentVariableSet(process.env[testEnvKey])).to.be.false;
        });

        it('returns false when env var is set to "false"', () => {
            process.env[testEnvKey] = 'false';
            expect(isEnvironmentVariableSet(process.env[testEnvKey])).to.be.false;
        });

        it('returns false when env var is set to "0"', () => {
            process.env[testEnvKey] = '0';
            expect(isEnvironmentVariableSet(process.env[testEnvKey])).to.be.false;
        });

        it('returns false when env var is set to empty string', () => {
            process.env[testEnvKey] = '';
            expect(isEnvironmentVariableSet(process.env[testEnvKey])).to.be.false;
        });
    });
});
