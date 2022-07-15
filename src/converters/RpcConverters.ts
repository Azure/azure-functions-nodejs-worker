// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { TraceContext } from '@azure/functions';
import {
    RpcNullableBool,
    RpcNullableDouble,
    RpcNullableString,
    RpcNullableTimestamp,
    RpcTraceContext,
    RpcTypedData,
} from '@azure/functions-core';
import { isLong } from 'long';
import { InternalException } from '../utils/InternalException';

/**
 * Converts 'ITypedData' input from the RPC layer to JavaScript types.
 * TypedData can be string, json, or bytes
 * @param typedData ITypedData object containing one of a string, json, or bytes property
 * @param convertStringToJson Optionally parse the string input type as JSON
 */
export function fromTypedData(typedData?: RpcTypedData, convertStringToJson = true) {
    typedData = typedData || {};
    let str = typedData.string || typedData.json;
    if (str !== undefined) {
        if (convertStringToJson) {
            try {
                if (str != null) {
                    str = JSON.parse(str);
                }
            } catch (err) {}
        }
        return str;
    } else if (typedData.bytes) {
        return Buffer.from(<Buffer>typedData.bytes);
    } else if (typedData.collectionBytes && typedData.collectionBytes.bytes) {
        const byteCollection = typedData.collectionBytes.bytes;
        return byteCollection.map((element) => Buffer.from(<Buffer>element));
    } else if (typedData.collectionString && typedData.collectionString.string) {
        return typedData.collectionString.string;
    } else if (typedData.collectionDouble && typedData.collectionDouble.double) {
        return typedData.collectionDouble.double;
    } else if (typedData.collectionSint64 && typedData.collectionSint64.sint64) {
        const longCollection = typedData.collectionSint64.sint64;
        return longCollection.map((element) => (isLong(element) ? element.toString() : element));
    }
}

/**
 * Converts 'IRpcTraceContext' input from RPC layer to dictionary of key value pairs.
 * @param traceContext IRpcTraceContext object containing the activityId, tracestate and attributes.
 */
export function fromRpcTraceContext(traceContext: RpcTraceContext | null | undefined): TraceContext {
    if (traceContext) {
        return <TraceContext>{
            traceparent: traceContext.traceParent,
            tracestate: traceContext.traceState,
            attributes: traceContext.attributes,
        };
    }

    return <TraceContext>{};
}

/**
 * Converts JavaScript type data to 'ITypedData' to be sent through the RPC layer
 * TypedData can be string, json, or bytes
 * @param inputObject A JavaScript object that is a string, Buffer, ArrayBufferView, number, or object.
 */
export function toTypedData(inputObject): RpcTypedData {
    if (typeof inputObject === 'string') {
        return { string: inputObject };
    } else if (Buffer.isBuffer(inputObject)) {
        return { bytes: inputObject };
    } else if (ArrayBuffer.isView(inputObject)) {
        const bytes = new Uint8Array(inputObject.buffer, inputObject.byteOffset, inputObject.byteLength);
        return { bytes: bytes };
    } else if (typeof inputObject === 'number') {
        if (Number.isInteger(inputObject)) {
            return { int: inputObject };
        } else {
            return { double: inputObject };
        }
    } else {
        return { json: JSON.stringify(inputObject) };
    }
}

/**
 * Converts boolean input to an 'INullableBool' to be sent through the RPC layer.
 * Input that is not a boolean but is also not null or undefined logs a function app level warning.
 * @param nullable Input to be converted to an INullableBool if it is a valid boolean
 * @param propertyName The name of the property that the caller will assign the output to. Used for debugging.
 */
export function toNullableBool(nullable: boolean | undefined, propertyName: string): undefined | RpcNullableBool {
    if (typeof nullable === 'boolean') {
        return <RpcNullableBool>{
            value: nullable,
        };
    }

    if (nullable != null) {
        throw new InternalException(
            `A 'boolean' type was expected instead of a '${typeof nullable}' type. Cannot parse value of '${propertyName}'.`
        );
    }

    return undefined;
}

/**
 * Converts number or string that parses to a number to an 'INullableDouble' to be sent through the RPC layer.
 * Input that is not a valid number but is also not null or undefined logs a function app level warning.
 * @param nullable Input to be converted to an INullableDouble if it is a valid number
 * @param propertyName The name of the property that the caller will assign the output to. Used for debugging.
 */
export function toNullableDouble(
    nullable: number | string | undefined,
    propertyName: string
): undefined | RpcNullableDouble {
    if (typeof nullable === 'number') {
        return <RpcNullableDouble>{
            value: nullable,
        };
    } else if (typeof nullable === 'string') {
        if (!isNaN(<any>nullable)) {
            const parsedNumber = parseFloat(nullable);
            return <RpcNullableDouble>{
                value: parsedNumber,
            };
        }
    }

    if (nullable != null) {
        throw new InternalException(
            `A 'number' type was expected instead of a '${typeof nullable}' type. Cannot parse value of '${propertyName}'.`
        );
    }

    return undefined;
}

/**
 * Converts string input to an 'INullableString' to be sent through the RPC layer.
 * Input that is not a string but is also not null or undefined logs a function app level warning.
 * @param nullable Input to be converted to an INullableString if it is a valid string
 * @param propertyName The name of the property that the caller will assign the output to. Used for debugging.
 */
export function toRpcString(nullable: string | undefined, propertyName: string): string {
    if (typeof nullable === 'string') {
        return nullable;
    }

    if (nullable != null) {
        throw new InternalException(
            `A 'string' type was expected instead of a '${typeof nullable}' type. Cannot parse value of '${propertyName}'.`
        );
    }

    return '';
}

/**
 * Converts string input to an 'INullableString' to be sent through the RPC layer.
 * Input that is not a string but is also not null or undefined logs a function app level warning.
 * @param nullable Input to be converted to an INullableString if it is a valid string
 * @param propertyName The name of the property that the caller will assign the output to. Used for debugging.
 */
export function toNullableString(nullable: string | undefined, propertyName: string): undefined | RpcNullableString {
    if (typeof nullable === 'string') {
        return <RpcNullableString>{
            value: nullable,
        };
    }

    if (nullable != null) {
        throw new InternalException(
            `A 'string' type was expected instead of a '${typeof nullable}' type. Cannot parse value of '${propertyName}'.`
        );
    }

    return undefined;
}

/**
 * Converts Date or number input to an 'INullableTimestamp' to be sent through the RPC layer.
 * Input that is not a Date or number but is also not null or undefined logs a function app level warning.
 * @param nullable Input to be converted to an INullableTimestamp if it is valid input
 * @param propertyName The name of the property that the caller will assign the output to. Used for debugging.
 */
export function toNullableTimestamp(
    dateTime: Date | number | undefined,
    propertyName: string
): RpcNullableTimestamp | undefined {
    if (dateTime != null) {
        try {
            const timeInMilliseconds = typeof dateTime === 'number' ? dateTime : dateTime.getTime();

            if (timeInMilliseconds && timeInMilliseconds >= 0) {
                return {
                    value: {
                        seconds: Math.round(timeInMilliseconds / 1000),
                    },
                };
            }
        } catch {
            throw new InternalException(
                `A 'number' or 'Date' input was expected instead of a '${typeof dateTime}'. Cannot parse value of '${propertyName}'.`
            );
        }
    }
    return undefined;
}
