// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { FunctionCallback } from '@azure/functions-core';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { loadScriptFile } from './loadScriptFile';
import { PackageJson } from './parsers/parsePackageJson';
import { InternalException } from './utils/InternalException';
import { nonNullProp } from './utils/nonNull';
import { RegisteredFunction } from './WorkerChannel';

export interface ILegacyFunctionLoader {
    load(functionId: string, metadata: rpc.IRpcFunctionMetadata, packageJson: PackageJson): Promise<void>;
    getFunction(functionId: string): RegisteredFunction;
}

interface LegacyRegisteredFunction extends RegisteredFunction {
    thisArg: unknown;
}

export class LegacyFunctionLoader implements ILegacyFunctionLoader {
    #loadedFunctions: { [k: string]: LegacyRegisteredFunction | undefined } = {};

    async load(functionId: string, metadata: rpc.IRpcFunctionMetadata, packageJson: PackageJson): Promise<void> {
        if (metadata.isProxy === true) {
            return;
        }
        const script: any = await loadScriptFile(nonNullProp(metadata, 'scriptFile'), packageJson);
        const entryPoint = <string>(metadata && metadata.entryPoint);
        const [callback, thisArg] = getEntryPoint(script, entryPoint);
        this.#loadedFunctions[functionId] = { metadata, callback, thisArg };
    }

    getFunction(functionId: string): RegisteredFunction {
        const loadedFunction = this.#loadedFunctions[functionId];
        if (loadedFunction) {
            return {
                metadata: loadedFunction.metadata,
                // `bind` is necessary to set the `this` arg, but it's also nice because it makes a clone of the function, preventing this invocation from affecting future invocations
                callback: loadedFunction.callback.bind(loadedFunction.thisArg),
            };
        } else {
            throw new InternalException(`Function code for '${functionId}' is not loaded and cannot be invoked.`);
        }
    }
}

function getEntryPoint(f: any, entryPoint?: string): [FunctionCallback, unknown] {
    let thisArg: unknown;
    if (f !== null && typeof f === 'object') {
        thisArg = f;
        if (entryPoint) {
            // the module exports multiple functions
            // and an explicit entry point was named
            f = f[entryPoint];
        } else if (Object.keys(f).length === 1) {
            // a single named function was exported
            const name = Object.keys(f)[0];
            f = f[name];
        } else {
            // finally, see if there is an exported function named
            // 'run' or 'index' by convention
            f = f.run || f.index;
        }
    }

    if (!f) {
        const msg =
            (entryPoint
                ? `Unable to determine function entry point: ${entryPoint}. `
                : 'Unable to determine function entry point. ') +
            'If multiple functions are exported, ' +
            "you must indicate the entry point, either by naming it 'run' or 'index', or by naming it " +
            "explicitly via the 'entryPoint' metadata property.";
        throw new InternalException(msg);
    } else if (typeof f !== 'function') {
        throw new InternalException(
            'The resolved entry point is not a function and cannot be invoked by the functions runtime. Make sure the function has been correctly exported.'
        );
    }

    return [f, thisArg];
}
