// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import 'mocha';
import { expect } from 'chai';
import { startNodeWorker } from '../src/Worker';

describe('Worker', () => {
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
        expect(() => {
            startNodeWorker(args);
        }).to.throw(
            "gRPC client connection info is missing or incorrect ('functions-request-id' is undefined, 'functions-grpc-max-message-length' is 0)."
        );
    });
});
