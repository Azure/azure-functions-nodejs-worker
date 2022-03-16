// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as url from 'url';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { FunctionInfo } from './FunctionInfo';
import { InternalException } from './utils/InternalException';
import { PackageJson } from './WorkerChannel';

export interface IFunctionLoader {
    load(functionId: string, metadata: rpc.IRpcFunctionMetadata, packageJson: PackageJson): Promise<void>;
    getInfo(functionId: string): FunctionInfo;
    getFunc(functionId: string): Function;
}

export class FunctionLoader implements IFunctionLoader {
    private _loadedFunctions: {
        [k: string]: {
            info: FunctionInfo;
            func: Function;
        };
    } = {};

    async load(functionId: string, metadata: rpc.IRpcFunctionMetadata, packageJson: PackageJson): Promise<void> {
        if (metadata.isProxy === true) {
            return;
        }
        const scriptFilePath = <string>(metadata && metadata.scriptFile);
        let script: any;
        if (this.isESModule(scriptFilePath, packageJson)) {
            // IMPORTANT: pathToFileURL is only supported in Node.js version >= v10.12.0
            const scriptFileUrl = url.pathToFileURL(scriptFilePath);
            if (scriptFileUrl.href) {
                // use eval so it doesn't get compiled into a require()
                script = await eval('import(scriptFileUrl.href)');
            } else {
                throw new InternalException(
                    `'${scriptFilePath}' could not be converted to file URL (${scriptFileUrl.href})`
                );
            }
        } else {
            script = require(scriptFilePath);
        }
        const entryPoint = <string>(metadata && metadata.entryPoint);
        const userFunction = getEntryPoint(script, entryPoint);
        if (typeof userFunction !== 'function') {
            throw new InternalException(
                'The resolved entry point is not a function and cannot be invoked by the functions runtime. Make sure the function has been correctly exported.'
            );
        }
        this._loadedFunctions[functionId] = {
            info: new FunctionInfo(metadata),
            func: userFunction,
        };
    }

    getInfo(functionId: string): FunctionInfo {
        const loadedFunction = this._loadedFunctions[functionId];
        if (loadedFunction && loadedFunction.info) {
            return loadedFunction.info;
        } else {
            throw new InternalException(`Function info for '${functionId}' is not loaded and cannot be invoked.`);
        }
    }

    getFunc(functionId: string): Function {
        const loadedFunction = this._loadedFunctions[functionId];
        if (loadedFunction && loadedFunction.func) {
            return loadedFunction.func;
        } else {
            throw new InternalException(`Function code for '${functionId}' is not loaded and cannot be invoked.`);
        }
    }

    isESModule(filePath: string, packageJson: PackageJson): boolean {
        if (filePath.endsWith('.mjs')) {
            return true;
        }
        if (filePath.endsWith('.cjs')) {
            return false;
        }
        if (packageJson.type === 'module') {
            return true;
        }
        return false;
    }
}

function getEntryPoint(f: any, entryPoint?: string): Function {
    if (f !== null && typeof f === 'object') {
        const obj = f;
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

        if (typeof f === 'function') {
            return function () {
                return f.apply(obj, arguments);
            };
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
    }

    return f;
}
