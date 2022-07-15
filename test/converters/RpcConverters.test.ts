// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { RpcTraceContext } from '@azure/functions-core';
import { expect } from 'chai';
import 'mocha';
import {
    fromRpcTraceContext,
    toNullableBool,
    toNullableDouble,
    toNullableString,
    toNullableTimestamp,
} from '../../src/converters/RpcConverters';

describe('Rpc Converters', () => {
    /** NullableBool */
    it('converts true to NullableBool', () => {
        const nullable = toNullableBool(true, 'test');
        expect(nullable && nullable.value).to.equal(true);
    });

    it('converts false to NullableBool', () => {
        const nullable = toNullableBool(false, 'test');
        expect(nullable && nullable.value).to.equal(false);
    });

    it('throws and does not converts string to NullableBool', () => {
        expect(() => {
            toNullableBool(<any>'true', 'test');
        }).to.throw("A 'boolean' type was expected instead of a 'string' type. Cannot parse value of 'test'.");
    });

    it('Converts IRpcTraceContext to tracecontext', () => {
        const traceparentvalue = 'tracep';
        const tracestatevalue = 'traces';
        const attributesvalue = { traceparent: 'traceparent', tracestate: 'tracestate' };

        const input = <RpcTraceContext>{
            traceParent: traceparentvalue,
            traceState: tracestatevalue,
            attributes: attributesvalue,
        };

        const traceContext = fromRpcTraceContext(input);

        expect(traceparentvalue).to.equal(traceContext.traceparent);
        expect(tracestatevalue).to.equal(traceContext.tracestate);
        expect(attributesvalue).to.equal(traceContext.attributes);
    });

    it('Converts null traceContext to empty values', () => {
        const traceContext = fromRpcTraceContext(null);
        expect(traceContext.traceparent).to.be.undefined;
        expect(traceContext.tracestate).to.be.undefined;
        expect(traceContext.attributes).to.be.undefined;
    });

    it('Converts undefined traceContext to empty values', () => {
        const traceContext = fromRpcTraceContext(undefined);
        expect(traceContext.traceparent).to.be.undefined;
        expect(traceContext.tracestate).to.be.undefined;
        expect(traceContext.attributes).to.be.undefined;
    });

    it('does not converts null to NullableBool', () => {
        const nullable = toNullableBool(<any>null, 'test');
        expect(nullable && nullable.value).to.be.undefined;
    });

    /** NullableString */
    it('converts string to NullableString', () => {
        const input = 'hello';
        const nullable = toNullableString(input, 'test');
        expect(nullable && nullable.value).to.equal(input);
    });

    it('converts empty string to NullableString', () => {
        const input = '';
        const nullable = toNullableString(input, 'test');
        expect(nullable && nullable.value).to.equal(input);
    });

    it('throws and does not convert number to NullableString', () => {
        expect(() => {
            toNullableString(<any>123, 'test');
        }).to.throw("A 'string' type was expected instead of a 'number' type. Cannot parse value of 'test'.");
    });

    it('does not convert null to NullableString', () => {
        const nullable = toNullableString(<any>null, 'test');
        expect(nullable && nullable.value).to.be.undefined;
    });

    /** NullableDouble */
    it('converts number to NullableDouble', () => {
        const input = 1234567;
        const nullable = toNullableDouble(input, 'test');
        expect(nullable && nullable.value).to.equal(input);
    });

    it('converts 0 to NullableDouble', () => {
        const input = 0;
        const nullable = toNullableDouble(input, 'test');
        expect(nullable && nullable.value).to.equal(input);
    });

    it('converts negative number to NullableDouble', () => {
        const input = -11234567;
        const nullable = toNullableDouble(input, 'test');
        expect(nullable && nullable.value).to.equal(input);
    });

    it('converts numeric string to NullableDouble', () => {
        const input = '1234567';
        const nullable = toNullableDouble(input, 'test');
        expect(nullable && nullable.value).to.equal(1234567);
    });

    it('converts float string to NullableDouble', () => {
        const input = '1234567.002';
        const nullable = toNullableDouble(input, 'test');
        expect(nullable && nullable.value).to.equal(1234567.002);
    });

    it('throws and does not convert non-number string to NullableDouble', () => {
        expect(() => {
            toNullableDouble(<any>'123hellohello!!111', 'test');
        }).to.throw("A 'number' type was expected instead of a 'string' type. Cannot parse value of 'test'.");
    });

    it('does not convert undefined to NullableDouble', () => {
        const nullable = toNullableDouble(undefined, 'test');
        expect(nullable && nullable.value).to.be.undefined;
    });

    /** NullableTimestamp */
    it('converts Date to NullableTimestamp', () => {
        const input = new Date('1/2/2014');
        const nullable = toNullableTimestamp(input, 'test');
        const secondInput = Math.round((<any>input).getTime() / 1000);
        expect(nullable && nullable.value && nullable.value.seconds).to.equal(secondInput);
    });

    it('converts Date.now to NullableTimestamp', () => {
        const input = Date.now();
        const nullable = toNullableTimestamp(input, 'test');
        const secondInput = Math.round(input / 1000);
        expect(nullable && nullable.value && nullable.value.seconds).to.equal(secondInput);
    });

    it('converts milliseconds to NullableTimestamp', () => {
        const input = Date.now();
        const nullable = toNullableTimestamp(input, 'test');
        const secondInput = Math.round(input / 1000);
        expect(nullable && nullable.value && nullable.value.seconds).to.equal(secondInput);
    });

    it('does not convert string to NullableTimestamp', () => {
        expect(() => {
            toNullableTimestamp(<any>'1/2/3 2014', 'test');
        }).to.throw("A 'number' or 'Date' input was expected instead of a 'string'. Cannot parse value of 'test'.");
    });

    it('does not convert object to NullableTimestamp', () => {
        expect(() => {
            toNullableTimestamp(<any>{ time: 100 }, 'test');
        }).to.throw("A 'number' or 'Date' input was expected instead of a 'object'. Cannot parse value of 'test'.");
    });

    it('does not convert undefined to NullableTimestamp', () => {
        const nullable = toNullableTimestamp(undefined, 'test');
        expect(nullable && nullable.value).to.be.undefined;
    });
});
