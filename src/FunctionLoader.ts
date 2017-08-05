import { isObject, isFunction } from 'util';

import { FunctionRpc as rpc } from '../protos/rpc';
import { FunctionInfo } from './FunctionInfo'

export interface IFunctionLoader {
  load(functionId: string, metadata: rpc.RpcFunctionMetadata$Properties): void;
  get(functionId: string): FunctionInfo;
}

export class FunctionLoader implements IFunctionLoader {
    private _loadedFunctions: { [k: string]: FunctionInfo } = {};

    load(functionId: string, metadata: rpc.RpcFunctionMetadata$Properties): void {
      let scriptFilePath = <string>metadata.scriptFile;
      let script = require(scriptFilePath);
      let userFunction = getEntryPoint(script, metadata.entryPoint);
      this._loadedFunctions[functionId] = new FunctionInfo(userFunction, metadata);
    }

    get(functionId: string): FunctionInfo {
      return this._loadedFunctions[functionId];
    }
}

function getEntryPoint(f: any, entryPoint?: string): Function {
    if (isObject(f)) {
        if (entryPoint) {
            // the module exports multiple functions
            // and an explicit entry point was named
            f = f[entryPoint];
        }
        else if (Object.keys(f).length === 1) {
            // a single named function was exported
            var name = Object.keys(f)[0];
            f = f[name];
        }
        else {
            // finally, see if there is an exported function named
            // 'run' or 'index' by convention
            f = f.run || f.index;
        }
    }

    if (!isFunction(f)) {
        throw "Unable to determine function entry point. If multiple functions are exported, " +
            "you must indicate the entry point, either by naming it 'run' or 'index', or by naming it " +
            "explicitly via the 'entryPoint' metadata property.";
    }

    return f;
}