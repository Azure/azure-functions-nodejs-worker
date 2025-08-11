// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import 'mocha';
import { expect } from 'chai';
import { AzureFunctionsRpcMessages as rpc } from './../azure-functions-language-worker-protobuf/src/rpc';
import { startBlockedMonitor } from './../src/utils/blockedMonitor';

describe('Event loop blocking operation monitor', () => {
    it('startBlockMonitor logs warning', async () => {
        console.log('start ' + new Date().getSeconds() + ':' + new Date().getMilliseconds());
        let timer: NodeJS.Timer | null = null;
        let isTimerDestroyed = false;
        const logFun = function (log: rpc.IRpcLog): void {
            expect(log.level).to.equal(rpc.RpcLog.Level.Warning);
            if (log.message && log.message.startsWith('Blocking code monitoring history')) {
                if (timer) {
                    clearInterval(timer);
                    isTimerDestroyed = true;
                }
            }
        };

        timer = startBlockedMonitor({ log: logFun }, 100, 100);
        await new Promise((resolve) => {
            //Adding new event to event loop to start monitoring
            setTimeout(() => {
                resolve(true);
            }, 1);
        });
        const end = Date.now() + 500;
        while (Date.now() < end) {} // blocking code

        await new Promise((resolve) => {
            //assert
            setTimeout(() => {
                if (isTimerDestroyed) {
                    resolve(true);
                }
            }, 500);
        });
    });
});
