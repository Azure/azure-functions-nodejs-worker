// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { RpcBindingInfo, RpcFunctionMetadata, RpcTypedData } from '@azure/functions-core';
import { toTypedData } from './converters/RpcConverters';
import { toRpcHttp } from './converters/RpcHttpConverters';

const returnBindingKey = '$return';

export class FunctionInfo {
    name: string;
    directory: string;
    bindings: {
        [key: string]: RpcBindingInfo;
    };
    outputBindings: {
        [key: string]: RpcBindingInfo & { converter: (any) => RpcTypedData };
    };
    httpOutputName: string;
    hasHttpTrigger: boolean;

    constructor(metadata: RpcFunctionMetadata) {
        this.name = <string>metadata.name;
        this.directory = <string>metadata.directory;
        this.bindings = {};
        this.outputBindings = {};
        this.httpOutputName = '';
        this.hasHttpTrigger = false;

        if (metadata.bindings) {
            const bindings = (this.bindings = metadata.bindings);

            // determine output bindings & assign rpc converter (http has quirks)
            Object.keys(bindings)
                .filter((name) => bindings[name].direction !== RpcBindingInfo.Direction.in)
                .forEach((name) => {
                    const type = bindings[name].type;
                    if (type && type.toLowerCase() === 'http') {
                        this.httpOutputName = name;
                        this.outputBindings[name] = Object.assign(bindings[name], { converter: toRpcHttp });
                    } else {
                        this.outputBindings[name] = Object.assign(bindings[name], { converter: toTypedData });
                    }
                });

            this.hasHttpTrigger =
                Object.keys(bindings).filter((name) => {
                    const type = bindings[name].type;
                    return type && type.toLowerCase() === 'httptrigger';
                }).length > 0;
        }
    }

    /**
     * Return output binding details on the special key "$return" output binding
     */
    getReturnBinding() {
        return this.outputBindings[returnBindingKey];
    }

    getTimerTriggerName(): string | undefined {
        for (const name in this.bindings) {
            const type = this.bindings[name].type;
            if (type && type.toLowerCase() === 'timertrigger') {
                return name;
            }
        }
        return;
    }
}
