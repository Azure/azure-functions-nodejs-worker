// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';
import type { IEventStream } from '../src/GrpcClient';
import { worker } from '../src/WorkerContext';

describe('Worker', () => {
    const workerModulePath = require.resolve('../src/Worker');
    const grpcClientModulePath = require.resolve('../src/GrpcClient');
    const setupCoreModulePath = require.resolve('../src/setupCoreModule');
    const setupEventStreamPath = require.resolve('../src/setupEventStream');
    const utilModulePath = require.resolve('../src/utils/util');
    const loggerModulePath = require.resolve('../src/utils/Logger');

    let originalExitListeners: Function[];
    let originalUncaughtExceptionListeners: Function[];
    let originalWorkerModule: NodeModule | undefined;
    let originalGrpcClientModule: NodeModule | undefined;
    let originalSetupCoreModule: NodeModule | undefined;
    let originalSetupEventStreamModule: NodeModule | undefined;
    let originalUtilModule: NodeModule | undefined;
    let originalLoggerModule: NodeModule | undefined;

    beforeEach(() => {
        originalExitListeners = process.listeners('exit');
        originalUncaughtExceptionListeners = process.listeners('uncaughtException');
        originalWorkerModule = require.cache[workerModulePath];
        originalGrpcClientModule = require.cache[grpcClientModulePath];
        originalSetupCoreModule = require.cache[setupCoreModulePath];
        originalSetupEventStreamModule = require.cache[setupEventStreamPath];
        originalUtilModule = require.cache[utilModulePath];
        originalLoggerModule = require.cache[loggerModulePath];
    });

    afterEach(() => {
        sinon.restore();

        restoreModule(workerModulePath, originalWorkerModule);
        restoreModule(grpcClientModulePath, originalGrpcClientModule);
        restoreModule(setupCoreModulePath, originalSetupCoreModule);
        restoreModule(setupEventStreamPath, originalSetupEventStreamModule);
        restoreModule(utilModulePath, originalUtilModule);
        restoreModule(loggerModulePath, originalLoggerModule);

        for (const listener of process.listeners('exit')) {
            if (!originalExitListeners.includes(listener)) {
                process.removeListener('exit', listener as (...args: any[]) => void);
            }
        }

        for (const listener of process.listeners('uncaughtException')) {
            if (!originalUncaughtExceptionListeners.includes(listener)) {
                process.removeListener('uncaughtException', listener as (...args: any[]) => void);
            }
        }

        worker._hostVersion = undefined;
        worker.resetApp(undefined);
    });

    it('throws error on incorrect args: grpcMaxMessageLength 0', () => {
        const args = [
            '/node',
            'nodejsWorker.js',
            '--functions-uri',
            'http://127.0.0.1:58870/',
            '--functions-worker-id',
            'bd2e3e80-46ba',
            '--functions-request-id',
            'bd2e3e80-46ba',
            '--functions-grpc-max-message-length',
            '0',
        ];
        const { startNodeWorker } = loadWorker();
        expect(() => {
            startNodeWorker(args);
        }).to.throw("gRPC client connection info is missing or incorrect ('functions-grpc-max-message-length' is 0).");
    });

    it('throws error on incorrect args: grpcMaxMessageLength 0 and null requestId', () => {
        const args = [
            '/node',
            'nodejsWorker.js',
            '--functions-uri',
            'http://127.0.0.1:58870/',
            '--functions-worker-id',
            'bd2e3e80-46ba',
            '--functions-grpc-max-message-length',
            '0',
        ];
        const { startNodeWorker } = loadWorker();
        expect(() => {
            startNodeWorker(args);
        }).to.throw(
            "gRPC client connection info is missing or incorrect ('functions-request-id' is undefined, 'functions-grpc-max-message-length' is 0)."
        );
    });

    it('passes the full functions URI into the grpc client without changing startup behavior', () => {
        const writeSpy = sinon.spy();
        const eventStream: IEventStream = {
            write: writeSpy,
            on: sinon.stub(),
            end: sinon.stub(),
        };
        const createGrpcEventStreamStub = sinon.stub().returns(eventStream);
        const setupCoreModuleStub = sinon.stub();
        const setupEventStreamStub = sinon.stub();
        const systemLogStub = sinon.stub();
        const { startNodeWorker } = loadWorker({
            [grpcClientModulePath]: {
                CreateGrpcEventStream: createGrpcEventStreamStub,
            },
            [setupCoreModulePath]: {
                setupCoreModule: setupCoreModuleStub,
            },
            [setupEventStreamPath]: {
                setupEventStream: setupEventStreamStub,
            },
            [utilModulePath]: {
                isEnvironmentVariableSet: sinon.stub().returns(false),
            },
            [loggerModulePath]: {
                systemLog: systemLogStub,
                systemError: sinon.stub(),
            },
        });

        const args = [
            '/node',
            'nodejsWorker.js',
            '--functions-uri',
            'https://127.0.0.1:58870/',
            '--functions-worker-id',
            'worker-id',
            '--functions-request-id',
            'request-id',
            '--functions-grpc-max-message-length',
            '65536',
        ];

        startNodeWorker(args);

        expect(createGrpcEventStreamStub.calledOnce).to.be.true;
        expect(createGrpcEventStreamStub.firstCall.args[0]).to.be.instanceOf(URL);
        expect(createGrpcEventStreamStub.firstCall.args[0].toString()).to.equal('https://127.0.0.1:58870/');
        expect(createGrpcEventStreamStub.firstCall.args[1]).to.equal(65536);
        expect(setupEventStreamStub.calledOnce).to.be.true;
        expect(setupCoreModuleStub.calledOnce).to.be.true;
        expect(worker.id).to.equal('worker-id');
        expect(writeSpy.calledOnce).to.be.true;
        expect(writeSpy.firstCall.args[0]).to.deep.equal({
            requestId: 'request-id',
            startStream: {
                workerId: 'worker-id',
            },
        });
        expect(systemLogStub.firstCall.args[0]).to.equal('Worker worker-id connecting to 127.0.0.1:58870 via https:');
    });

    function loadWorker(overrides: Record<string, unknown> = {}): typeof import('../src/Worker') {
        for (const [modulePath, moduleExports] of Object.entries(overrides)) {
            require.cache[modulePath] = { exports: moduleExports } as NodeModule;
        }

        delete require.cache[workerModulePath];
        return module.require('../src/Worker') as typeof import('../src/Worker');
    }

    function restoreModule(modulePath: string, originalModule: NodeModule | undefined): void {
        if (originalModule) {
            require.cache[modulePath] = originalModule;
        } else {
            delete require.cache[modulePath];
        }
    }
});
