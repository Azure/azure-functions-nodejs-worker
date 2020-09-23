import { toNullableBool, toNullableString, toNullableDouble, toNullableTimestamp, fromRpcTraceContext, fromTypedData } from '../src/converters';
import { expect } from 'chai';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import 'mocha';

describe('Rpc Converters', () => {
  /** NullableBool */ 
  it('converts true to NullableBool', () => {
    let nullable = toNullableBool(true, "test");
    expect(nullable && nullable.value).to.equal(true);
  });

  it('converts false to NullableBool', () => {
    let nullable = toNullableBool(false, "test");
    expect(nullable && nullable.value).to.equal(false);
  });

  it('throws and does not converts string to NullableBool', () => {
    expect(() => {
      toNullableBool(<any>"true", "test");
    }).to.throw("A 'boolean' type was expected instead of a 'string' type. Cannot parse value of 'test'.")
  });

  it('Converts IRpcTraceContext to tracecontext', () => {
    let traceparentvalue = "tracep";
    let tracestatevalue = "traces";
    let attributesvalue = {"traceparent": "traceparent", "tracestate": "tracestate"};

    let input = <rpc.IRpcTraceContext>({
      traceParent: traceparentvalue,
      traceState: tracestatevalue,
      attributes: attributesvalue
    });

    let traceContext = fromRpcTraceContext(input);
    
    expect(traceparentvalue).to.equal(traceContext.traceparent);
    expect(tracestatevalue).to.equal(traceContext.tracestate);
    expect(attributesvalue).to.equal(traceContext.attributes);
  });

  it('Converts null traceContext to empty values', () => {
    let traceContext = fromRpcTraceContext(null);
    expect(traceContext.traceparent).to.be.undefined;
    expect(traceContext.tracestate).to.be.undefined;
    expect(traceContext.attributes).to.be.undefined;
  });

  it('Converts undefined traceContext to empty values', () => {
    let traceContext = fromRpcTraceContext(undefined);
    expect(traceContext.traceparent).to.be.undefined;
    expect(traceContext.tracestate).to.be.undefined;
    expect(traceContext.attributes).to.be.undefined;
  });

  it('does not converts null to NullableBool', () => {
    let nullable = toNullableBool(<any>null, "test");
    expect(nullable && nullable.value).to.be.undefined;
  });

  /** NullableString */
  it('converts string to NullableString', () => {
    let input = "hello";
    let nullable = toNullableString(input, "test");
    expect(nullable && nullable.value).to.equal(input);
  });

  it('converts empty string to NullableString', () => {
    let input = "";
    let nullable = toNullableString(input, "test");
    expect(nullable && nullable.value).to.equal(input);
  });

  it('throws and does not convert number to NullableString', () => {
    expect(() => {
      toNullableString(<any>123, "test");
    }).to.throw("A 'string' type was expected instead of a 'number' type. Cannot parse value of 'test'.");
  });

  it('does not convert null to NullableString', () => {
    let nullable = toNullableString(<any>null, "test");
    expect(nullable && nullable.value).to.be.undefined;
  });

  /** NullableDouble */
  it('converts number to NullableDouble', () => {
    let input = 1234567;
    let nullable = toNullableDouble(input, "test");
    expect(nullable && nullable.value).to.equal(input);
  });

  it('converts 0 to NullableDouble', () => {
    let input = 0;
    let nullable = toNullableDouble(input, "test");
    expect(nullable && nullable.value).to.equal(input);
  });

  it('converts negative number to NullableDouble', () => {
    let input = -11234567;
    let nullable = toNullableDouble(input, "test");
    expect(nullable && nullable.value).to.equal(input);
  });

  it('converts numeric string to NullableDouble', () => {
    let input = "1234567";
    let nullable = toNullableDouble(input, "test");
    expect(nullable && nullable.value).to.equal(1234567);
  });

  it('converts float string to NullableDouble', () => {
    let input = "1234567.002";
    let nullable = toNullableDouble(input, "test");
    expect(nullable && nullable.value).to.equal(1234567.002);
  });

  it('throws and does not convert non-number string to NullableDouble', () => {
    expect(() => {
      toNullableDouble(<any>"123hellohello!!111", "test");
    }).to.throw("A 'number' type was expected instead of a 'string' type. Cannot parse value of 'test'.");
  });

  it('does not convert undefined to NullableDouble', () => {
    let nullable = toNullableDouble(undefined, "test");
    expect(nullable && nullable.value).to.be.undefined;
  });

  /** NullableTimestamp */ 
  it('converts Date to NullableTimestamp', () => {
    let input = new Date("1/2/2014")
    let nullable = toNullableTimestamp(input, "test");
    let secondInput = Math.round((<any>input).getTime() / 1000);
    expect(nullable && nullable.value && nullable.value.seconds).to.equal(secondInput);
  });

  it('converts Date.now to NullableTimestamp', () => {
    let input = Date.now();
    let nullable = toNullableTimestamp(input, "test");
    let secondInput = Math.round(input / 1000);
    expect(nullable && nullable.value && nullable.value.seconds).to.equal(secondInput);
  });

  it('converts milliseconds to NullableTimestamp', () => {
    let input = Date.now();
    let nullable = toNullableTimestamp(input, "test");
    let secondInput = Math.round(input / 1000);
    expect(nullable && nullable.value && nullable.value.seconds).to.equal(secondInput);
  });

  it('does not convert string to NullableTimestamp', () => {
    expect(() => {
      toNullableTimestamp(<any>"1/2/3 2014", "test");
    }).to.throw("A 'number' or 'Date' input was expected instead of a 'string'. Cannot parse value of 'test'.");
  });

  it('does not convert object to NullableTimestamp', () => {
    expect(() => {
      toNullableTimestamp(<any>{ time: 100 }, "test");
    }).to.throw("A 'number' or 'Date' input was expected instead of a 'object'. Cannot parse value of 'test'.");
  });

  it('does not convert undefined to NullableTimestamp', () => {
    let nullable = toNullableTimestamp(undefined, "test");
    expect(nullable && nullable.value).to.be.undefined;
  });

  it('numeric-string keeps string type', () => {
    let numericString = fromTypedData({ string: '12345678901234567890' });
    expect(numericString).to.equal('12345678901234567890');
  });
})