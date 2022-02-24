// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import 'mocha';
import * as sinon from 'sinon';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { logColdStartWarning } from '../../src/eventHandlers/workerInitRequest';
import { WorkerChannel } from '../../src/WorkerChannel';
import { beforeEventHandlerTest } from './beforeEventHandlerTest';
import { TestEventStream } from './TestEventStream';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

describe('workerInitRequest', () => {
    let channel: WorkerChannel;
    let stream: TestEventStream;

    beforeEach(() => {
        ({ stream, channel } = beforeEventHandlerTest());
    });

    it('responds to init', () => {
        const initMessage = {
            requestId: 'id',
            workerInitRequest: {
                capabilities: {},
            },
        };

        const expectedOutput = {
            requestId: 'id',
            workerInitResponse: {
                capabilities: {
                    RpcHttpBodyOnly: 'true',
                    RpcHttpTriggerMetadataRemoved: 'true',
                    IgnoreEmptyValuedRpcHttpHeaders: 'true',
                    UseNullableValueDictionaryForHttp: 'true',
                },
                result: {
                    status: rpc.StatusResult.Status.Success,
                },
            },
        };

        expectedOutput.workerInitResponse.capabilities['TypedDataCollection'] = 'true';

        stream.addTestMessage(initMessage);
        sinon.assert.calledWith(stream.written);
    });

    it('does not init for Node.js v8.x and v2 compatability = false', () => {
        const version = process.version;
        if (version.split('.')[0] === 'v8') {
            const initMessage = {
                requestId: 'id',
                workerInitRequest: {
                    capabilities: {},
                },
            };

            expect(() => stream.addTestMessage(initMessage)).to.throw(
                `Incompatible Node.js version (${process.version}). The version of the Azure Functions runtime you are using (v3) supports Node.js v10.x and v12.x. Refer to our documentation to see the Node.js versions supported by each version of Azure Functions: https://aka.ms/functions-node-versions`
            );
        }
    });

    it('logs AzureFiles cold start warning', async () => {
        process.env.WEBSITE_CONTENTAZUREFILECONNECTIONSTRING = 'test';
        process.env.WEBSITE_CONTENTSHARE = 'test';
        process.env.AzureWebJobsScriptRoot = 'test';

        logColdStartWarning(channel, 10);

        // Set slight delay
        await new Promise((resolve) => setTimeout(resolve, 1000));
        sinon.assert.calledWith(stream.written, <rpc.IStreamingMessage>{
            rpcLog: {
                message:
                    'package.json is not found at the root of the Function App in Azure Files - cold start for NodeJs can be affected.',
                level: LogLevel.Debug,
                logCategory: LogCategory.System,
            },
        });
    });
});
