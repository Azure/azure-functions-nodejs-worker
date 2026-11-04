// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import 'mocha';
import { expect } from 'chai';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as sinon from 'sinon';
import { AzureFunctionsRpcMessages as rpc } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { FunctionEnvironmentReloadHandler } from '../../src/eventHandlers/FunctionEnvironmentReloadHandler';
import { WorkerInitHandler } from '../../src/eventHandlers/WorkerInitHandler';
import { HostConfigurationSnapshot } from '../../src/HostConfigurationSnapshot';
import { worker } from '../../src/WorkerContext';
import { beforeEventHandlerSuite } from './beforeEventHandlerSuite';
import { msg } from './msg';
import { testAppPath, testPackageJsonPath } from './testAppUtils';
import { RegExpStreamingMessage, TestEventStream } from './TestEventStream';

const Status = rpc.HostConfiguration.Status;

describe('WorkerInitHandler host configuration', () => {
    let stream: TestEventStream;
    let root: string;
    let filePath: string;
    let sandbox: sinon.SinonSandbox;

    before(async () => {
        stream = beforeEventHandlerSuite();
        await fs.writeFile(testPackageJsonPath, '{}');
    });

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(__dirname, 'host-configuration-'));
        filePath = path.join(root, 'host.json');
        process.env.FUNCTIONS_APPLICATION_DIRECTORY = root;
        sandbox = sinon.createSandbox();
    });

    afterEach(async () => {
        sandbox.restore();
        await fs.rm(root, { recursive: true, force: true });
        await stream.afterEachEventHandlerTest();
    });

    function request(capability: string | undefined = '1'): rpc.IStreamingMessage {
        const request = msg.init.request(testAppPath);
        request.workerInitRequest!.capabilities = capability === undefined ? {} : { HostConfiguration: capability };
        return request;
    }

    function response(configuration: rpc.IHostConfiguration): RegExpStreamingMessage {
        return new RegExpStreamingMessage(
            {
                ...msg.init.response.expectedMsg,
                workerInitResponse: {
                    ...msg.init.response.expectedMsg.workerInitResponse,
                    hostConfiguration: configuration,
                },
            },
            {
                'workerInitResponse.workerMetadata.runtimeVersion': /^[0-9]+\.[0-9]+\.[0-9]+$/,
                'workerInitResponse.workerMetadata.workerBitness': /^(x64|x86|arm64)$/,
                'workerInitResponse.workerMetadata.workerVersion': /^(3|4)\.[0-9]+\.[0-9]+$/,
                'workerInitResponse.workerMetadata.customProperties.modelVersion': /^(3|4)\.[0-9]+\.[0-9]+$/,
            }
        );
    }

    function failureWarning(reason: string) {
        return msg.warningLog(
            `Host configuration could not be delivered to the host. Reason: ${reason}. The failure is retained until the worker process restarts.`
        );
    }

    it('uses the local root while preserving Host-provided app startup and capabilities', async () => {
        await fs.writeFile(filePath, '{"local":true}');
        process.env.AzureFunctionsJobHost__local = 'false';
        stream.addTestMessage(request());
        await stream.assertCalledWith(
            msg.init.receivedRequestLog,
            msg.init.nodeVersionLog(),
            response({ status: Status.Available, content: Buffer.from('{"local":true}') })
        );
        expect(worker.app.functionAppDirectory).to.equal(testAppPath);
        expect(worker.app.packageJson).to.deep.equal({});
    });

    for (const value of ['', '0', 'true', '01', ' 1', '1 ']) {
        it(`omits delivery and leaves the snapshot unused for capability ${JSON.stringify(value)}`, async () => {
            const open = sandbox.spy(fs, 'open');
            stream.addTestMessage(request(value));
            await stream.assertCalledWith(msg.init.receivedRequestLog, msg.init.nodeVersionLog(), msg.init.response);
            expect(open.called).to.be.false;
            await fs.writeFile(filePath, '"enabled-later"');
            stream.addTestMessage(request());
            await stream.assertCalledWith(
                msg.init.receivedRequestLog,
                msg.init.nodeVersionLog(),
                response({ status: Status.Available, content: Buffer.from('"enabled-later"') })
            );
            expect(open.calledOnce).to.be.true;
        });
    }

    for (const status of [Status.Missing, Status.Error, Status.TooLarge]) {
        it(`preserves init success and capabilities on ${Status[status]}`, async () => {
            if (status !== Status.Missing) {
                await fs.writeFile(filePath, status === Status.Error ? Buffer.from([0xff]) : Buffer.alloc(65537));
            }
            stream.addTestMessage(request());
            await stream.assertCalledWith(
                status === Status.Missing
                    ? undefined
                    : failureWarning(status === Status.Error ? 'InvalidEncoding' : 'Oversized'),
                msg.init.receivedRequestLog,
                msg.init.nodeVersionLog(),
                response({ status })
            );
        });
    }

    it('does not fall back to the Host root or cwd when the local root is unset', async () => {
        delete process.env.FUNCTIONS_APPLICATION_DIRECTORY;
        process.env.AzureWebJobsScriptRoot = testAppPath;
        const open = sandbox.spy(fs, 'open');
        stream.addTestMessage(request());
        await stream.assertCalledWith(
            failureWarning('AppDirectoryNotSet'),
            msg.init.receivedRequestLog,
            msg.init.nodeVersionLog(),
            response({ status: Status.Error })
        );
        expect(open.called).to.be.false;
    });

    it('does not introduce an async boundary before existing initialization when unrequested', async () => {
        const init = msg.init.request(testAppPath).workerInitRequest!;
        const result = new WorkerInitHandler().handleEvent(init);
        expect(worker._hostVersion).to.equal(init.hostVersion);
        expect(worker.app.functionAppDirectory).to.equal(testAppPath);
        expect((await result).hostConfiguration).to.be.undefined;
        await stream.assertCalledWith(msg.init.receivedRequestLog, msg.init.nodeVersionLog());
    });

    it('does not leak acquisition exceptions through logs, metadata, or init result', async () => {
        sandbox.stub(fs, 'open').rejects(new Error('secret-configuration-path-and-value'));
        stream.addTestMessage(request());
        await stream.assertCalledWith(
            failureWarning('OpenFailed'),
            msg.init.receivedRequestLog,
            msg.init.nodeVersionLog(),
            response({ status: Status.Error })
        );
    });

    it('attaches configuration even when existing initialization fails', async () => {
        await fs.writeFile(filePath, '{}');
        const init = request();
        init.workerInitRequest!.hostVersion = null;
        stream.addTestMessage(init);
        const errorMessage = 'Internal error: Expected value to be neither null nor undefined: hostVersion';
        const failure = msg.init.failedResponse(errorMessage);
        failure.expectedMsg.workerInitResponse!.hostConfiguration = {
            status: Status.Available,
            content: Buffer.from('{}'),
        };
        await stream.assertCalledWith(msg.init.receivedRequestLog, msg.errorLog(errorMessage), failure);
    });

    it('shares acquisition across concurrent init handlers and copies retry envelopes', async () => {
        await fs.writeFile(filePath, '"original"');
        const open = sandbox.spy(fs, 'open');
        const init = request().workerInitRequest!;
        const firstHandler = new WorkerInitHandler();
        const [first, second] = await Promise.all([
            firstHandler.handleEvent(init),
            new WorkerInitHandler().handleEvent(init),
        ]);
        await stream.assertCalledWith(
            msg.init.receivedRequestLog,
            msg.init.receivedRequestLog,
            msg.init.nodeVersionLog(),
            msg.init.nodeVersionLog()
        );
        expect(first.capabilities).to.deep.equal(msg.capabilities);
        expect(second.capabilities).to.deep.equal(msg.capabilities);
        expect(first.hostConfiguration).to.deep.equal(second.hostConfiguration);
        expect(first.hostConfiguration).not.to.equal(second.hostConfiguration);
        first.hostConfiguration!.content!.fill(0);
        first.hostConfiguration!.status = Status.Error;
        expect(firstHandler.getDefaultResponse(init).hostConfiguration).to.deep.equal({
            status: Status.Available,
            content: Buffer.from('"original"'),
        });
        await fs.writeFile(filePath, '"changed"');
        const retry = await new WorkerInitHandler().handleEvent(init);
        await stream.assertCalledWith(msg.init.receivedRequestLog, msg.init.nodeVersionLog());
        expect(retry.hostConfiguration).to.deep.equal({
            status: Status.Available,
            content: Buffer.from('"original"'),
        });
        expect(open.calledOnce).to.be.true;
    });

    it('preserves programming-model capability customization', async () => {
        await fs.writeFile(filePath, '{}');
        expect(worker.app.programmingModel).not.to.be.undefined;
        const model = worker.app.programmingModel!;
        const original = model.getCapabilities;
        model.getCapabilities = async (capabilities) => ({ ...capabilities, CustomCapability: 'enabled' });
        try {
            const result = await new WorkerInitHandler().handleEvent(request().workerInitRequest!);
            await stream.assertCalledWith(msg.init.receivedRequestLog, msg.init.nodeVersionLog());
            expect(result.capabilities).to.deep.equal({ ...msg.capabilities, CustomCapability: 'enabled' });
            expect(result.hostConfiguration).to.deep.equal({
                status: Status.Available,
                content: Buffer.from('{}'),
            });
        } finally {
            model.getCapabilities = original;
        }
    });

    it('creates a new lazy snapshot generation during environment reload', async () => {
        await fs.writeFile(filePath, '"before-specialization"');
        await worker.app.hostConfiguration.getConfiguration(request().workerInitRequest!);
        const previous = worker.app.hostConfiguration;
        await fs.writeFile(filePath, '"after-specialization"');
        const acquire = sandbox.spy(HostConfigurationSnapshot.prototype, 'getConfiguration');
        await new FunctionEnvironmentReloadHandler().handleEvent({
            environmentVariables: { FUNCTIONS_APPLICATION_DIRECTORY: root },
        });
        await stream.assertCalledWith(
            msg.envReload.funcAppDirNotDefined,
            msg.envReload.reloadEnvVarsLog(1),
            msg.envReload.nodeVersionLog()
        );
        expect(worker.app.hostConfiguration).not.to.equal(previous);
        expect(acquire.called).to.be.false;
        expect(await worker.app.hostConfiguration.getConfiguration(request().workerInitRequest!)).to.deep.equal({
            status: Status.Available,
            content: Buffer.from('"after-specialization"'),
        });
    });

    it('delivers compact JSON without changing application startup or init capabilities', async () => {
        await fs.writeFile(filePath, '// comment\n{ "n": 9007199254740993, "n": -0, }');
        stream.addTestMessage(request());
        await stream.assertCalledWith(
            msg.init.receivedRequestLog,
            msg.init.nodeVersionLog(),
            response({ status: Status.Available, content: Buffer.from('{"n":9007199254740993,"n":-0}') })
        );
    });

    it('logs one safe warning for concurrent/repeated malformed JSON while preserving init success', async () => {
        await fs.writeFile(filePath, '{"secret-configuration-value":');
        const init = request().workerInitRequest!;
        const results = await Promise.all([
            new WorkerInitHandler().handleEvent(init),
            new WorkerInitHandler().handleEvent(init),
        ]);
        await stream.assertCalledWith(
            failureWarning('InvalidJson'),
            msg.init.receivedRequestLog,
            msg.init.receivedRequestLog,
            msg.init.nodeVersionLog(),
            msg.init.nodeVersionLog()
        );
        for (const result of results) {
            expect(result.capabilities).to.deep.equal(msg.capabilities);
            expect(result.hostConfiguration).to.deep.equal({ status: Status.Error });
        }

        await fs.writeFile(filePath, '{}');
        stream.addTestMessage(request());
        await stream.assertCalledWith(
            msg.init.receivedRequestLog,
            msg.init.nodeVersionLog(),
            response({ status: Status.Error })
        );
    });

    it('logs a fresh failure once for each application generation', async () => {
        await fs.writeFile(filePath, '{invalid');
        const init = request().workerInitRequest!;
        expect(await worker.app.hostConfiguration.getConfiguration(init)).to.deep.equal({ status: Status.Error });
        await stream.assertCalledWith(failureWarning('InvalidJson'));

        await new FunctionEnvironmentReloadHandler().handleEvent({
            environmentVariables: { FUNCTIONS_APPLICATION_DIRECTORY: root },
        });
        await stream.assertCalledWith(
            msg.envReload.funcAppDirNotDefined,
            msg.envReload.reloadEnvVarsLog(1),
            msg.envReload.nodeVersionLog()
        );
        expect(await worker.app.hostConfiguration.getConfiguration(init)).to.deep.equal({ status: Status.Error });
        expect(await worker.app.hostConfiguration.getConfiguration(init)).to.deep.equal({ status: Status.Error });
        await stream.assertCalledWith(failureWarning('InvalidJson'));
    });

    it('does not let a throwing log hook suppress the system warning or fail initialization', async () => {
        await fs.writeFile(filePath, '{invalid');
        worker.app.logHooks.push(() => {
            throw new Error('secret-hook-error');
        });
        stream.addTestMessage(request());
        await stream.assertCalledWith(
            failureWarning('InvalidJson'),
            msg.init.receivedRequestLog,
            msg.init.nodeVersionLog(),
            response({ status: Status.Error })
        );
    });
});
