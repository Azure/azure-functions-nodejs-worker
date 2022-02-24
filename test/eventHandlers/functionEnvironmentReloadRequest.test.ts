// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import 'mocha';
import * as sinon from 'sinon';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { beforeEventHandlerTest } from './beforeEventHandlerTest';
import { TestEventStream } from './TestEventStream';

describe('functionEnvironmentReloadRequest', () => {
    let stream: TestEventStream;

    // Reset `process.env` after this test suite so it doesn't affect other tests
    let originalEnv: NodeJS.ProcessEnv;
    before(() => {
        originalEnv = process.env;
    });

    after(() => {
        process.env = originalEnv;
    });

    beforeEach(() => {
        ({ stream } = beforeEventHandlerTest());
    });

    it('reloads environment variables', () => {
        process.env.PlaceholderVariable = 'TRUE';
        stream.addTestMessage({
            requestId: 'id',
            functionEnvironmentReloadRequest: {
                environmentVariables: {
                    hello: 'world',
                    SystemDrive: 'Q:',
                },
                functionAppDirectory: null,
            },
        });
        sinon.assert.calledWith(stream.written, <rpc.IStreamingMessage>{
            requestId: 'id',
            functionEnvironmentReloadResponse: {
                result: {
                    status: rpc.StatusResult.Status.Success,
                },
            },
        });
        expect(process.env.hello).to.equal('world');
        expect(process.env.SystemDrive).to.equal('Q:');
        expect(process.env.PlaceholderVariable).to.be.undefined;
    });

    it('reloading environment variables removes existing environment variables', () => {
        process.env.PlaceholderVariable = 'TRUE';
        process.env.NODE_ENV = 'Debug';
        stream.addTestMessage({
            requestId: 'id',
            functionEnvironmentReloadRequest: {
                environmentVariables: {},
                functionAppDirectory: null,
            },
        });
        sinon.assert.calledWith(stream.written, <rpc.IStreamingMessage>{
            requestId: 'id',
            functionEnvironmentReloadResponse: {
                result: {
                    status: rpc.StatusResult.Status.Success,
                },
            },
        });
        expect(process.env).to.be.empty;
    });

    it('reloads empty environment variables without throwing', () => {
        expect(() => {
            stream.write({
                requestId: 'id',
                functionEnvironmentReloadRequest: {
                    environmentVariables: {},
                    functionAppDirectory: null,
                },
            });
        }).to.not.throw();

        expect(() => {
            stream.write({
                requestId: 'id',
                functionEnvironmentReloadRequest: null,
            });
        }).to.not.throw();

        expect(() => {
            stream.write({
                requestId: 'id',
                functionEnvironmentReloadRequest: {
                    environmentVariables: null,
                    functionAppDirectory: null,
                },
            });
        }).to.not.throw();
    });

    it('reloads environment variable and keeps cwd without functionAppDirectory', () => {
        const cwd = process.cwd();
        stream.addTestMessage({
            requestId: 'id',
            functionEnvironmentReloadRequest: {
                environmentVariables: {
                    hello: 'world',
                    SystemDrive: 'Q:',
                },
                functionAppDirectory: null,
            },
        });
        sinon.assert.calledWith(stream.written, <rpc.IStreamingMessage>{
            requestId: 'id',
            functionEnvironmentReloadResponse: {
                result: {
                    status: rpc.StatusResult.Status.Success,
                },
            },
        });
        expect(process.env.hello).to.equal('world');
        expect(process.env.SystemDrive).to.equal('Q:');
        expect(process.cwd() == cwd);
    });

    it('reloads environment variable and changes functionAppDirectory', () => {
        const cwd = process.cwd();
        const newDir = '/';
        stream.addTestMessage({
            requestId: 'id',
            functionEnvironmentReloadRequest: {
                environmentVariables: {
                    hello: 'world',
                    SystemDrive: 'Q:',
                },
                functionAppDirectory: newDir,
            },
        });
        sinon.assert.calledWith(stream.written, <rpc.IStreamingMessage>{
            requestId: 'id',
            functionEnvironmentReloadResponse: {
                result: {
                    status: rpc.StatusResult.Status.Success,
                },
            },
        });
        expect(process.env.hello).to.equal('world');
        expect(process.env.SystemDrive).to.equal('Q:');
        expect(process.cwd() != newDir);
        expect(process.cwd() == newDir);
        process.chdir(cwd);
    });
});
