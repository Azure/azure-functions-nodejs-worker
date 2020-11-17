import { isObject, isFunction } from 'util';

import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { FunctionInfo } from './FunctionInfo'
import { InternalException } from "./utils/InternalException";

export interface IFunctionLoader {
  load(functionId: string, metadata: rpc.IRpcFunctionMetadata): Promise<void>;
  getInfo(functionId: string): FunctionInfo;
  getFunc(functionId: string): Function;
}

export class FunctionLoader implements IFunctionLoader {
    private _loadedFunctions: { [k: string]: {
        info: FunctionInfo,
        func: Function
    }} = {};
    private allowESModules = process.version.startsWith("v14");

    async load(functionId: string, metadata: rpc.IRpcFunctionMetadata): Promise<void> {
      if (metadata.isProxy === true) {
          return;
      }
      let scriptFilePath = <string>(metadata && metadata.scriptFile);
      let script: any;
      if (scriptFilePath.endsWith(".mjs")) {
        if (this.allowESModules) {
          // use eval so it doesn't get compiled into a require()
          script = await eval("import(scriptFilePath)");
        } else {
          throw new InternalException(`Please use a Node.js version >= v14 to use ES Modules for '${scriptFilePath}'`);
        }
      } else {
        script = require(scriptFilePath);
      }
      let entryPoint = <string>(metadata && metadata.entryPoint);
      let userFunction = getEntryPoint(script, entryPoint);
      if(!isFunction(userFunction)) {
        throw new InternalException("The resolved entry point is not a function and cannot be invoked by the functions runtime. Make sure the function has been correctly exported.");
      }
      this._loadedFunctions[functionId] = {
          info: new FunctionInfo(metadata),
          func: userFunction
      };
    }

    getInfo(functionId: string): FunctionInfo {
      let loadedFunction = this._loadedFunctions[functionId];
      if (loadedFunction && loadedFunction.info) {
          return loadedFunction.info;
      } else {
          throw new InternalException(`Function info for '${functionId}' is not loaded and cannot be invoked.`);
      }
    }

    getFunc(functionId: string): Function {
        let loadedFunction = this._loadedFunctions[functionId];
        if (loadedFunction && loadedFunction.func) {
            return loadedFunction.func;
        } else {
            throw new InternalException(`Function code for '${functionId}' is not loaded and cannot be invoked.`);
        }
    }
}

function getEntryPoint(f: any, entryPoint?: string): Function {
    if (isObject(f)) {
        var obj = f;
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

        if (isFunction(f)){
            return function() {
                return f.apply(obj, arguments);
            }
        }
    }

    if (!f) {
        let msg = (entryPoint ? `Unable to determine function entry point: ${entryPoint}. `: "Unable to determine function entry point. ") + "If multiple functions are exported, " +
            "you must indicate the entry point, either by naming it 'run' or 'index', or by naming it " +
            "explicitly via the 'entryPoint' metadata property.";
        throw new InternalException(msg);
    }

    return f;
}