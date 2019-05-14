import { 
    AzureFunctionsRpcMessages as rpc,
    INullableString,
    INullableBool,
    INullableDouble,
    INullableTimestamp
} from '../../azure-functions-language-worker-protobuf/src/rpc';

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

declare type NullableType<T> = T extends string ? INullableString : T extends boolean ? INullableBool : T extends Long ? INullableDouble : never;
export function toNullable<T>(nullable: T | undefined): undefined | NullableType<T> {
    if (nullable === undefined) {
        return undefined;
    } else {
        let value = <any>nullable;
        return <NullableType<T>>{
            value
        };
    }
}

export function toNullableTimestamp(dateTime: Date | number | undefined): INullableTimestamp | undefined {
    if (dateTime) {
        let timeInMilliseconds = (typeof dateTime === "number") ? dateTime : dateTime.getTime();

        if (timeInMilliseconds && timeInMilliseconds >= 0) {
            return {
                value: {
                    seconds: Math.round(timeInMilliseconds / 1000)
                }
            }
        }
    }
    return undefined;
}
