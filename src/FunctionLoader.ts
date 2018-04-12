import { isObject, isFunction } from 'util';

import { FunctionRpc as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { FunctionInfo } from './FunctionInfo'

export interface IFunctionLoader {
  load(functionId: string, metadata: rpc.RpcFunctionMetadata$Properties): void;
  getInfo(functionId: string): FunctionInfo;
  getFunc(functionId: string): Function;
}

export class FunctionLoader implements IFunctionLoader {
    private _loadedFunctions: { [k: string]: {
        info: FunctionInfo,
        func: Function
    }} = {};

    load(functionId: string, metadata: rpc.RpcFunctionMetadata$Properties): void {
      let scriptFilePath = <string>metadata.scriptFile;
      let script = require(scriptFilePath);
      let userFunction = getEntryPoint(script, metadata.entryPoint);
      if(!isFunction(userFunction)) {
        throw "The resolved entry point is not a function and cannot be invoked by the functions runtime. Make sure the function has been correctly exported.";
      }
      this._loadedFunctions[functionId] = {
          info: new FunctionInfo(metadata),
          func: userFunction
      };
    }

    getInfo(functionId: string): FunctionInfo {
      return this._loadedFunctions[functionId].info;
    }

    getFunc(functionId: string): Function {
        return this._loadedFunctions[functionId].func;
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

    if (!f) {
        throw (entryPoint ? `Unable to determine function entry point: ${entryPoint}. `: "Unable to determine function entry point. ") + "If multiple functions are exported, " +
            "you must indicate the entry point, either by naming it 'run' or 'index', or by naming it " +
            "explicitly via the 'entryPoint' metadata property.";
    }

    return f;
}