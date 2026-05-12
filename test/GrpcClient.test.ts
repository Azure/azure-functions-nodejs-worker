// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import 'mocha';
import { expect } from 'chai';
import { EventEmitter } from 'events';
import * as sinon from 'sinon';
import { AzFuncSystemError } from '../src/errors';
import type { IEventStream } from '../src/GrpcClient';

type GrpcClientModule = typeof import('../src/GrpcClient');

class FakeEventStream extends EventEmitter implements IEventStream {
    write(): void {}
    end(): void {}
}

describe('GrpcClient', () => {
    const grpcModulePath = require.resolve('@grpc/grpc-js');
    const protoLoaderModulePath = require.resolve('@grpc/proto-loader');
    const grpcClientModulePath = require.resolve('../src/GrpcClient');

    let originalGrpcModule: NodeModule | undefined;
    let originalProtoLoaderModule: NodeModule | undefined;
    let originalExitListeners: Function[];

    beforeEach(() => {
        originalGrpcModule = require.cache[grpcModulePath];
        originalProtoLoaderModule = require.cache[protoLoaderModulePath];
        originalExitListeners = process.listeners('exit');
    });

    afterEach(() => {
        restoreModule(grpcModulePath, originalGrpcModule);
        restoreModule(protoLoaderModulePath, originalProtoLoaderModule);
        delete require.cache[grpcClientModulePath];

        for (const listener of process.listeners('exit')) {
            if (!originalExitListeners.includes(listener)) {
                process.removeListener('exit', listener as (...args: any[]) => void);
            }
        }
    });

    it('uses insecure credentials for http functions URIs', () => {
        const insecureCredentials = { insecure: true };
        const sslCredentials = { ssl: true };
        const eventStream = new FakeEventStream();
        const createdClients: Array<{ address: string; credentials: unknown; options: unknown }> = [];
        const grpcStub = {
            closeClient: sinon.stub(),
            credentials: {
                createInsecure: sinon.stub().returns(insecureCredentials),
                createSsl: sinon.stub().returns(sslCredentials),
            },
            makeClientConstructor: sinon.stub().returns(function TestClient(address, credentials, options) {
                createdClients.push({ address, credentials, options });
                return {
                    eventStream: () => eventStream,
                };
            }),
        };
        const protoLoaderStub = {
            fromJSON: sinon.stub().returns({
                'AzureFunctionsRpcMessages.FunctionRpc': {},
            }),
        };

        const { CreateGrpcEventStream } = loadGrpcClient(grpcStub, protoLoaderStub);
        const actualEventStream = CreateGrpcEventStream('http://127.0.0.1:5001/', 2048);

        expect(actualEventStream).to.equal(eventStream);
        expect(grpcStub.credentials.createInsecure.calledOnce).to.be.true;
        expect(grpcStub.credentials.createSsl.notCalled).to.be.true;
        expect(createdClients).to.deep.equal([
            {
                address: '127.0.0.1:5001',
                credentials: insecureCredentials,
                options: {
                    'grpc.max_send_message_length': 2048,
                    'grpc.max_receive_message_length': 2048,
                },
            },
        ]);
    });

    it('uses SSL credentials for https functions URIs', () => {
        const insecureCredentials = { insecure: true };
        const sslCredentials = { ssl: true };
        const eventStream = new FakeEventStream();
        const createdClients: Array<{ address: string; credentials: unknown; options: unknown }> = [];
        const grpcStub = {
            closeClient: sinon.stub(),
            credentials: {
                createInsecure: sinon.stub().returns(insecureCredentials),
                createSsl: sinon.stub().returns(sslCredentials),
            },
            makeClientConstructor: sinon.stub().returns(function TestClient(address, credentials, options) {
                createdClients.push({ address, credentials, options });
                return {
                    eventStream: () => eventStream,
                };
            }),
        };
        const protoLoaderStub = {
            fromJSON: sinon.stub().returns({
                'AzureFunctionsRpcMessages.FunctionRpc': {},
            }),
        };

        const { CreateGrpcEventStream } = loadGrpcClient(grpcStub, protoLoaderStub);
        const actualEventStream = CreateGrpcEventStream(new URL('https://127.0.0.1:5002/'), 4096);

        expect(actualEventStream).to.equal(eventStream);
        expect(grpcStub.credentials.createSsl.calledOnce).to.be.true;
        expect(grpcStub.credentials.createInsecure.notCalled).to.be.true;
        expect(createdClients).to.deep.equal([
            {
                address: '127.0.0.1:5002',
                credentials: sslCredentials,
                options: {
                    'grpc.max_send_message_length': 4096,
                    'grpc.max_receive_message_length': 4096,
                },
            },
        ]);
    });

    it('throws a clear error for unsupported URI schemes', () => {
        const grpcStub = {
            closeClient: sinon.stub(),
            credentials: {
                createInsecure: sinon.stub(),
                createSsl: sinon.stub(),
            },
            makeClientConstructor: sinon.stub(),
        };
        const protoLoaderStub = {
            fromJSON: sinon.stub().returns({
                'AzureFunctionsRpcMessages.FunctionRpc': {},
            }),
        };

        const { CreateGrpcEventStream } = loadGrpcClient(grpcStub, protoLoaderStub);

        let error: unknown;
        try {
            CreateGrpcEventStream('ftp://127.0.0.1:5003/', 1024);
        } catch (err) {
            error = err;
        }

        expect(error).to.be.instanceOf(AzFuncSystemError);
        expect((error as Error).message).to.contain("Unsupported gRPC connection URI scheme 'ftp:'");
        expect((error as Error).message).to.contain("Expected 'http:' or 'https:'");
        expect(grpcStub.credentials.createInsecure.notCalled).to.be.true;
        expect(grpcStub.credentials.createSsl.notCalled).to.be.true;
        expect(grpcStub.makeClientConstructor.calledOnce).to.be.true;
    });

    function loadGrpcClient(grpcStub: unknown, protoLoaderStub: unknown): GrpcClientModule {
        require.cache[grpcModulePath] = { exports: grpcStub } as NodeModule;
        require.cache[protoLoaderModulePath] = { exports: protoLoaderStub } as NodeModule;
        delete require.cache[grpcClientModulePath];
        return module.require('../src/GrpcClient') as GrpcClientModule;
    }

    function restoreModule(modulePath: string, originalModule: NodeModule | undefined): void {
        if (originalModule) {
            require.cache[modulePath] = originalModule;
        } else {
            delete require.cache[modulePath];
        }
    }
});
