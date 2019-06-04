import { toNullableBool, toNullableString, toNullableDouble, toNullableTimestamp } from '../src/converters';
import { expect } from 'chai';
import * as sinon from 'sinon';
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

  it('does not converts string to NullableBool', () => {
    let nullable = toNullableBool(<any>"true", "test");
    expect(nullable && nullable.value).to.be.undefined;
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

  it('does not convert number to NullableString', () => {
    let nullable = toNullableBool(<any>123, "test");
    expect(nullable && nullable.value).to.be.undefined;
  });

  it('does not convert null to NullableString', () => {
    let nullable = toNullableBool(<any>null, "test");
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

  it('does not convert non-number string to NullableDouble', () => {
    let nullable = toNullableDouble(<any>"123hellohello!!111", "test");
    expect(nullable && nullable.value).to.be.undefined;
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
    let nullable = toNullableTimestamp(<any>"1/2/3 2014", "test");
    expect(nullable && nullable.value && nullable.value.seconds).to.be.undefined;
  });

  it('does not convert object to NullableTimestamp', () => {
    let nullable = toNullableTimestamp(<any>{ time: 100 }, "test");
    expect(nullable && nullable.value).to.be.undefined;
  });

  it('does not convert undefined to NullableTimestamp', () => {
    let nullable = toNullableTimestamp(undefined, "test");
    expect(nullable && nullable.value).to.be.undefined;
  });
})