// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { assert } from 'console';
import 'mocha';
import { AzureFunctionsRpcMessages as rpc } from './../azure-functions-language-worker-protobuf/src/rpc';
import { startBlockedMonitor } from './../src/utils/blockedMonitor';
import LogLevel = rpc.RpcLog.Level;

describe('Event loop blocking operation monitor', () => {
    it('startBlockMonitor logs warning', function () {
        let timer: NodeJS.Timer | null = null;
        try {
            let message = '';

            const logFun = function (log: rpc.IRpcLog): void {
                assert(log.level == LogLevel.Warning);
                message += 'test';
            };

            timer = startBlockedMonitor({ log: logFun });
            const end = Date.now() + 1000;
            while (Date.now() < end) {}
            assert(message == 'test');
            clearTimeout(timer);
        } finally {
            if (timer) {
                clearInterval(timer);
            }
        }
    });
});
