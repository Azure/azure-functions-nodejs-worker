// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as sinon from 'sinon';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { IEventStream } from '../../src/GrpcClient';
import { worker } from '../../src/WorkerContext';
import { testAppSrcPath, testPackageJsonPath } from './testAppUtils';

export class TestEventStream extends EventEmitter implements IEventStream {
    originalEnv: NodeJS.ProcessEnv;
    originalCwd: string;
    written: sinon.SinonSpy;
    constructor() {
        super();
        this.written = sinon.spy();
        this.originalEnv = { ...process.env };
        this.originalCwd = process.cwd();
    }
    write(message: rpc.IStreamingMessage) {
        this.written(message);
    }
    end(): void {}

    addTestMessage(msg: rpc.IStreamingMessage) {
        this.emit('data', rpc.StreamingMessage.create(msg));
    }

    /**
     * Waits up to a second for the expected number of messages to be written and then validates those messages
     */
    async assertCalledWith(...expectedMsgs: (rpc.IStreamingMessage | RegExpStreamingMessage)[]): Promise<void> {
        try {
            // Wait for up to a second for the expected number of messages to come in
            const maxTime = Date.now() + 1000;
            const interval = 10;
            while (this.written.getCalls().length < expectedMsgs.length && Date.now() < maxTime) {
                await new Promise((resolve) => setTimeout(resolve, interval));
            }

            const calls = this.written.getCalls();

            // First, validate the "shortened" form of the messages. This will result in a more readable error for most test failures
            if (
                !expectedMsgs.find((m) => m instanceof RegExpStreamingMessage) ||
                calls.length !== expectedMsgs.length
            ) {
                // shortened message won't work if it's a regexp
                // but if the call count doesn't match, this error will be better than the one below
                const shortExpectedMsgs = expectedMsgs.map(getShortenedMsg);
                const shortActualMsgs = calls.map((c) => getShortenedMsg(c.args[0]));
                expect(shortActualMsgs).to.deep.equal(shortExpectedMsgs);
            }

            // Next, do a more comprehensive check on the messages
            expect(calls.length).to.equal(
                expectedMsgs.length,
                'Message count does not match. This may be caused by the previous test writing extraneous messages.'
            );
            for (let i = 0; i < expectedMsgs.length; i++) {
                const call = calls[i];
                expect(call.args).to.have.length(1);
                const actualMsg = convertHttpResponse(call.args[0]);

                let expectedMsg = expectedMsgs[i];
                if (expectedMsg instanceof RegExpStreamingMessage) {
                    expectedMsg.validateRegExpProps(actualMsg);
                    expectedMsg = expectedMsg.expectedMsg;
                }
                expectedMsg = convertHttpResponse(expectedMsg);

                expect(actualMsg).to.deep.equal(expectedMsg);
            }
        } finally {
            this.written.resetHistory();
        }
    }

    /**
     * Verifies the test didn't send any extraneous messages
     */
    async afterEachEventHandlerTest(): Promise<void> {
        // Reset `process.env` and process.cwd() after each test so it doesn't affect other tests
        process.chdir(this.originalCwd);
        for (const key of Object.keys(process.env)) {
            if (!(key in this.originalEnv)) {
                delete process.env[key];
            }
        }
        Object.assign(process.env, this.originalEnv);

        // Reset require cache for test app files, otherwise they're only ever loaded once
        const files = await fs.readdir(testAppSrcPath);
        for (const file of files) {
            delete require.cache[require.resolve(path.join(testAppSrcPath, file))];
        }

        await fs.writeFile(testPackageJsonPath, '{}');

        worker._hostVersion = undefined;
        worker.resetApp(this.originalCwd);

        // minor delay so that it's more likely extraneous messages are associated with this test as opposed to leaking into the next test
        await new Promise((resolve) => setTimeout(resolve, 20));
        await this.assertCalledWith();
    }
}

function getShortenedMsg(msg: rpc.IStreamingMessage | RegExpStreamingMessage): string {
    msg = msg instanceof RegExpStreamingMessage ? msg.expectedMsg : msg;
    if (msg.rpcLog?.message) {
        return msg.rpcLog.message;
    } else {
        for (const [k, v] of Object.entries(msg)) {
            // only interested in response messages
            if (/response/i.test(k)) {
                let result: string;
                let errorMsg: string | undefined;
                switch (v.result?.status) {
                    case rpc.StatusResult.Status.Success:
                        result = 'success';
                        break;
                    case rpc.StatusResult.Status.Failure:
                        result = 'failed';
                        errorMsg = v.result.exception?.message;
                        break;
                    case rpc.StatusResult.Status.Cancelled:
                        result = 'cancelled';
                        break;
                    default:
                        result = 'unknown';
                        break;
                }
                let shortMsg = `Message: "${k}". Result: "${result}"`;
                if (errorMsg) {
                    shortMsg += ` Error: "${errorMsg}"`;
                }
                return shortMsg;
            }
        }
    }
    return 'Unknown message';
}

/**
 * Converts the `HttpResponse` object in any invocation response message to a simpler object that's easier to verify with `deep.equal`
 */
function convertHttpResponse(msg: rpc.IStreamingMessage): rpc.IStreamingMessage {
    if (msg.invocationResponse?.outputData) {
        for (const entry of msg.invocationResponse.outputData) {
            if (entry.data?.http) {
                const res = entry.data.http;
                entry.data.http = {
                    body: res.body,
                    cookies: res.cookies,
                    headers: res.headers,
                    statusCode: res.statusCode?.toString(),
                };
            }
        }
    }
    return msg;
}

export type RegExpProps = { [keyPath: string]: RegExp };

/**
 * Allows you to use regular expressions to validate properties of the message instead of just deep equal
 */
export class RegExpStreamingMessage {
    expectedMsg: rpc.IStreamingMessage;
    #regExpProps: RegExpProps;

    constructor(expectedMsg: rpc.IStreamingMessage, regExpProps: RegExpProps) {
        this.expectedMsg = expectedMsg;
        this.#regExpProps = regExpProps;
    }

    validateRegExpProps(actualMsg: rpc.IStreamingMessage) {
        for (const [keyPath, regExp] of Object.entries(this.#regExpProps)) {
            let lastKey: string = keyPath;
            let lastObject: {} = actualMsg;
            let value: unknown = actualMsg;
            for (const subpath of keyPath.split('.')) {
                if (typeof value === 'object' && value !== null) {
                    lastKey = subpath;
                    lastObject = value;
                    value = value[subpath];
                } else {
                    break;
                }
            }
            expect(value).to.match(regExp);

            delete lastObject[lastKey];
        }
    }
}
