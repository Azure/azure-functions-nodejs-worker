import { 
    AzureFunctionsRpcMessages as rpc,
    INullableString,
    INullableBool,
    INullableDouble,
    INullableTimestamp
} from '../../azure-functions-language-worker-protobuf/src/rpc';
import { systemWarn } from '../utils/Logger';

export function fromTypedData(typedData?: rpc.ITypedData, convertStringToJson: boolean = true) {
    typedData = typedData || {};
    let str = typedData.string || typedData.json;
    if (str !== undefined) {
        if (convertStringToJson) {
            try {
                if (str != null) {
                    str = JSON.parse(str);
                }
            } catch (err) { }
        }
        return str;
    } else if (typedData.bytes) {
        return Buffer.from(<Buffer>typedData.bytes);
    }
}

export function toTypedData(inputObject): rpc.ITypedData {
    if (typeof inputObject === 'string') {
        return { string: inputObject };
    } else if (Buffer.isBuffer(inputObject)) {
        return { bytes: inputObject };
    } else if (ArrayBuffer.isView(inputObject)) {
        let bytes = new Uint8Array(inputObject.buffer, inputObject.byteOffset, inputObject.byteLength)
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

export function toNullableBool(nullable: boolean | undefined, propertyName: string): undefined | INullableBool {
    if (typeof nullable === 'boolean') {
        return <INullableBool>{
            value: nullable
        };
    } else if (nullable != null) {
        systemWarn(`A 'boolean' type was expected instead of a '${typeof nullable}' type. Cannot parse value for '${propertyName}'.`);
    }
    
    return undefined;
}

export function toNullableDouble(nullable: number | undefined, propertyName: string): undefined | INullableDouble {
    if (typeof nullable === 'number') {
        return <INullableDouble>{
            value: nullable
        };
    } else if (typeof nullable === 'string') {
        const parsedNumber = parseFloat(nullable);
        if (!isNaN(parsedNumber)) {
            return <INullableDouble>{
                value: parsedNumber
            };
        }
    } else if (nullable != null) {
        systemWarn(`A 'number' type was expected instead of a '${typeof nullable}' type. Cannot parse value of '${propertyName}'.`);
    }

    return undefined;
}

export function toNullableString(nullable: string | undefined, propertyName: string): undefined | INullableString {
    if (typeof nullable === 'string') {
        return <INullableString>{
            value: nullable
        };
    } else if (nullable != null) {
        systemWarn(`A 'string' type was expected instead of a '${typeof nullable}' type. Cannot parse value of '${propertyName}'.`);
    }

    return undefined;
}

export function toNullableTimestamp(dateTime: Date | number | undefined, propertyName: string): INullableTimestamp | undefined {
    if (dateTime != null) {
        try {
            let timeInMilliseconds = (typeof dateTime === "number") ? dateTime : dateTime.getTime();

            if (timeInMilliseconds && timeInMilliseconds >= 0) {
                return {
                    value: {
                        seconds: Math.round(timeInMilliseconds / 1000)
                    }
                }
            }
        } catch(e) {
            systemWarn(`A 'number' or 'Date' input was expected instead of a '${typeof dateTime}'. Cannot parse value of '${propertyName}'.`, e);
        }
    }
    return undefined;
}
