// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

import * as util from 'util';
import { Response } from './http/response';
import { Request } from './http/request';
import { EventStream} from '../src/rpcService';

export function clearRequireCache() {
    Object.keys(require.cache).forEach(function (key) {
        delete require.cache[key];
    });
}

export function getEntryPoint(f: any, entryPoint?: string): Function {
    if (util.isObject(f)) {
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

    if (!util.isFunction(f)) {
        throw "Unable to determine function entry point. If multiple functions are exported, " +
            "you must indicate the entry point, either by naming it 'run' or 'index', or by naming it " +
            "explicitly via the 'entryPoint' metadata property.";
    }

    return f;
}