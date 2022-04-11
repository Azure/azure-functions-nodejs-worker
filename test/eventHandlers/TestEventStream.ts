// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import { EventEmitter } from 'events';
import * as sinon from 'sinon';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { IEventStream } from '../../src/GrpcClient';
import { Response } from '../../src/http/Response';

export class TestEventStream extends EventEmitter implements IEventStream {
    written: sinon.SinonSpy;
    constructor() {
        super();
        this.written = sinon.spy();
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
    async assertCalledWith(...expectedMsgs: rpc.IStreamingMessage[]): Promise<void> {
        try {
            // Wait for up to a second for the expected number of messages to come in
            const maxTime = Date.now() + 1000;
            const interval = 10;
            while (this.written.getCalls().length < expectedMsgs.length && Date.now() < maxTime) {
                await new Promise((resolve) => setTimeout(resolve, interval));
            }

            const calls = this.written.getCalls();

            // First, validate the "shortened" form of the messages. This will result in a more readable error for most test failures
            const shortExpectedMsgs = expectedMsgs.map(getShortenedMsg);
            const shortActualMsgs = calls.map((c) => getShortenedMsg(c.args[0]));
            expect(shortActualMsgs).to.deep.equal(shortExpectedMsgs);

            // Next, do a more comprehensive check on the messages
            expect(calls.length).to.equal(
                expectedMsgs.length,
                'Message count does not match. This may be caused by the previous test writing extraneous messages.'
            );
            for (let i = 0; i < expectedMsgs.length; i++) {
                const expectedMsg = convertHttpResponse(expectedMsgs[i]);
                const call = calls[i];
                expect(call.args).to.have.length(1);
                const actualMsg = convertHttpResponse(call.args[0]);
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
        // minor delay so that it's more likely extraneous messages are associated with this test as opposed to leaking into the next test
        await new Promise((resolve) => setTimeout(resolve, 20));
        await this.assertCalledWith();
    }
}

function getShortenedMsg(msg: rpc.IStreamingMessage): string {
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
            if (entry.data?.http instanceof Response) {
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
