// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import 'mocha';
import * as mock from 'mock-fs';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { logColdStartWarning } from '../../src/eventHandlers/workerInitRequest';
import { WorkerChannel } from '../../src/WorkerChannel';
import { beforeEventHandlerSuite } from './beforeEventHandlerSuite';
import { TestEventStream } from './TestEventStream';
import LogCategory = rpc.RpcLog.RpcLogCategory;
import LogLevel = rpc.RpcLog.Level;

namespace Msg {
    export function init(functionAppDirectory?: string): rpc.IStreamingMessage {
        return {
            requestId: 'id',
            workerInitRequest: {
                capabilities: {},
                functionAppDirectory,
            },
        };
    }

    export const response: rpc.IStreamingMessage = {
        requestId: 'id',
        workerInitResponse: {
            capabilities: {
                RpcHttpBodyOnly: 'true',
                RpcHttpTriggerMetadataRemoved: 'true',
                IgnoreEmptyValuedRpcHttpHeaders: 'true',
                UseNullableValueDictionaryForHttp: 'true',
                WorkerStatus: 'true',
                TypedDataCollection: 'true',
            },
            result: {
                status: rpc.StatusResult.Status.Success,
            },
        },
    };

    export const coldStartWarning: rpc.IStreamingMessage = {
        rpcLog: {
            message:
                'package.json is not found at the root of the Function App in Azure Files - cold start for NodeJs can be affected.',
            level: LogLevel.Debug,
            logCategory: LogCategory.System,
        },
    };
}

describe('workerInitRequest', () => {
    let channel: WorkerChannel;
    let stream: TestEventStream;

    before(() => {
        ({ stream, channel } = beforeEventHandlerSuite());
    });

    afterEach(async () => {
        mock.restore();
        await stream.afterEachEventHandlerTest();
    });

    it('responds to init', async () => {
        stream.addTestMessage(Msg.init());
        await stream.assertCalledWith(Msg.response);
    });

    it('does not init for Node.js v8.x and v2 compatability = false', () => {
        const version = process.version;
        if (version.split('.')[0] === 'v8') {
            expect(() => stream.addTestMessage(Msg.init())).to.throw(
                `Incompatible Node.js version (${process.version}). The version of the Azure Functions runtime you are using (v3) supports Node.js v10.x and v12.x. Refer to our documentation to see the Node.js versions supported by each version of Azure Functions: https://aka.ms/functions-node-versions`
            );
        }
    });

    it('logs AzureFiles cold start warning', async () => {
        process.env.WEBSITE_CONTENTAZUREFILECONNECTIONSTRING = 'test';
        process.env.WEBSITE_CONTENTSHARE = 'test';
        process.env.AzureWebJobsScriptRoot = 'test';

        logColdStartWarning(channel, 10);

        await stream.assertCalledWith(Msg.coldStartWarning);
    });

    it('correctly loads package.json file', async () => {
        const appDir = 'appDir';
        const expectedPackageJson = {
            type: 'module',
        };
        mock({
            [appDir]: {
                'package.json': JSON.stringify(expectedPackageJson),
            },
        });

        stream.addTestMessage(Msg.init(appDir));
        await stream.assertCalledWith(Msg.response);
        expect(channel.packageJson).to.deep.equal(expectedPackageJson);
    });

    it('loads empty package.json', async () => {
        const appDir = 'appDir';
        mock({
            [appDir]: {
                'not-package-json': 'some content',
            },
        });

        stream.addTestMessage(Msg.init(appDir));
        await stream.assertCalledWith(Msg.response);
        expect(channel.packageJson).to.be.empty;
    });

    it('ignores malformed package.json', async () => {
        const appDir = 'appDir';
        mock({
            [appDir]: {
                'package.json': 'gArB@g3 dAtA',
            },
        });

        stream.addTestMessage(Msg.init(appDir));
        await stream.assertCalledWith(Msg.response);
        expect(channel.packageJson).to.be.empty;
    });
});
