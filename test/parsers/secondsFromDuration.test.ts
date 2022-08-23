// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import { google } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { secondsFromDuration } from '../../src/parsers/secondsFromDuration';

describe('secondsFromDuration', () => {
    it('throws on empty duration object', () => {
        const duration: google.protobuf.IDuration = {};
        expect(() => {
            secondsFromDuration(duration);
        }).to.throw('Duration empty');
    });

    it('correctly parses seconds only', () => {
        const duration: google.protobuf.IDuration = {
            seconds: 5,
        };
        expect(secondsFromDuration(duration)).to.equal(5);
    });

    it('correctly parses nanos only', () => {
        const duration: google.protobuf.IDuration = {
            nanos: 5,
        };
        expect(secondsFromDuration(duration)).to.equal(0.000000005);
    });

    it('correctly parses seconds and nanos', () => {
        const duration: google.protobuf.IDuration = {
            seconds: 5,
            nanos: 1000000023,
        };
        expect(secondsFromDuration(duration)).to.equal(6.000000023);
    });
});
