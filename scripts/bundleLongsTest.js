// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const repoRoot = path.resolve(__dirname, '..');
const builtWorkerDirectory = path.join(repoRoot, 'dist', 'src');
const builtWorkerEntryPoint = path.join(builtWorkerDirectory, 'nodejsWorker.js');
const builtWorkerBundle = path.join(builtWorkerDirectory, 'worker-bundle.js');
const rpcDescriptor = require(path.join(
    repoRoot,
    'dist',
    'azure-functions-language-worker-protobuf',
    'src',
    'rpc.js'
));
const packageDefinition = protoLoader.fromJSON(rpcDescriptor, {
    objects: true,
    defaults: true,
    oneofs: true,
    longs: Number,
});
const rpc = grpc.loadPackageDefinition(packageDefinition).AzureFunctionsRpcMessages;

function createTestApp() {
    const appDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'node-worker-bundle-longs-'));
    const scriptFile = path.join(appDirectory, 'index.js');
    const workerDirectory = path.join(appDirectory, 'worker');
    const workerEntryPoint = path.join(workerDirectory, 'nodejsWorker.js');
    fs.mkdirSync(workerDirectory);
    fs.copyFileSync(builtWorkerEntryPoint, workerEntryPoint);
    fs.copyFileSync(builtWorkerBundle, path.join(workerDirectory, 'worker-bundle.js'));
    fs.writeFileSync(
        scriptFile,
        [
            'module.exports = async function (context) {',
            '    const metadata = context.triggerMetadata || context.bindingData;',
            '    return JSON.stringify({',
            '        scalar: metadata.scalar.int,',
            '        collection: metadata.collection,',
            '    });',
            '};',
            '',
        ].join('\n')
    );
    return { appDirectory, scriptFile, workerEntryPoint };
}

function bindServer(server) {
    return new Promise((resolve, reject) => {
        server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error, port) => {
            if (error) {
                reject(error);
            } else {
                resolve(port);
            }
        });
    });
}

async function main() {
    for (const requiredPath of [builtWorkerEntryPoint, builtWorkerBundle]) {
        if (!fs.existsSync(requiredPath)) {
            throw new Error(`Production worker artifact does not exist: ${requiredPath}`);
        }
    }

    const { appDirectory, scriptFile, workerEntryPoint } = createTestApp();
    const server = new grpc.Server();
    let workerProcess;
    let timeout;
    let rejectCompleted;
    let testFinished = false;
    let workerOutput = '';

    try {
        const completed = new Promise((resolve, reject) => {
            rejectCompleted = reject;
            server.addService(rpc.FunctionRpc.service, {
                eventStream(call) {
                    call.on('data', (message) => {
                        try {
                            switch (message.content) {
                                case 'startStream':
                                    call.write({
                                        requestId: 'init',
                                        workerInitRequest: {
                                            capabilities: {},
                                            hostVersion: '4.0.0',
                                        },
                                    });
                                    break;
                                case 'workerInitResponse':
                                    if (message.workerInitResponse.result.status !== 1) {
                                        throw new Error('Worker initialization failed');
                                    }
                                    call.write({
                                        requestId: 'load',
                                        functionLoadRequest: {
                                            functionId: 'bundleLongsTest',
                                            metadata: {
                                                name: 'bundleLongsTest',
                                                scriptFile,
                                                bindings: {
                                                    testTrigger: {
                                                        type: 'testTrigger',
                                                        direction: 'in',
                                                    },
                                                    $return: {
                                                        type: 'test',
                                                        direction: 'out',
                                                    },
                                                },
                                            },
                                        },
                                    });
                                    break;
                                case 'functionLoadResponse':
                                    if (message.functionLoadResponse.result.status !== 1) {
                                        throw new Error('Function load failed');
                                    }
                                    call.write({
                                        requestId: 'invoke',
                                        invocationRequest: {
                                            invocationId: 'bundleLongsInvocation',
                                            functionId: 'bundleLongsTest',
                                            triggerMetadata: {
                                                scalar: { int: 2251 },
                                                collection: {
                                                    collectionSint64: {
                                                        sint64: [2251, 2252, 2253],
                                                    },
                                                },
                                            },
                                        },
                                    });
                                    break;
                                case 'invocationResponse': {
                                    const response = message.invocationResponse;
                                    if (response.result.status !== 1) {
                                        throw new Error(
                                            `Function invocation failed: ${JSON.stringify(response.result.exception)}`
                                        );
                                    }

                                    const actual = JSON.parse(response.returnValue.string);
                                    const expected = {
                                        scalar: 2251,
                                        collection: [2251, 2252, 2253],
                                    };
                                    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                                        throw new Error(
                                            `Bundled worker decoded protobuf longs incorrectly: ${JSON.stringify(actual)}`
                                        );
                                    }

                                    resolve();
                                    break;
                                }
                            }
                        } catch (error) {
                            rejectWithOutput(error);
                        }
                    });
                    call.on('error', rejectWithOutput);
                },
            });
        });

        const port = await bindServer(server);
        server.start();
        workerProcess = childProcess.spawn(
            process.execPath,
            [
                workerEntryPoint,
                '--functions-uri',
                `http://127.0.0.1:${port}`,
                '--functions-worker-id',
                'bundle-longs-test-worker',
                '--functions-request-id',
                'bundle-longs-test-request',
                '--functions-grpc-max-message-length',
                '4194304',
            ],
            {
                cwd: repoRoot,
                stdio: ['ignore', 'pipe', 'pipe'],
            }
        );

        workerProcess.stdout.on('data', (data) => {
            workerOutput += data.toString();
        });
        workerProcess.stderr.on('data', (data) => {
            workerOutput += data.toString();
        });
        workerProcess.on('error', rejectWithOutput);
        workerProcess.on('exit', (code, signal) => {
            if (!testFinished) {
                rejectWithOutput(
                    new Error(`Bundled worker exited before test completion with code ${code} and signal ${signal}`)
                );
            }
        });

        timeout = setTimeout(() => {
            rejectWithOutput(new Error('Bundled worker regression test timed out'));
        }, 30000);

        function rejectWithOutput(error) {
            const output = workerOutput.trim();
            if (output) {
                error.message += `\nWorker output:\n${output}`;
            }
            rejectCompleted(error);
        }

        await completed;
        if (workerOutput.includes("Couldn't require bundle")) {
            throw new Error(`Production bundle was not loaded\nWorker output:\n${workerOutput.trim()}`);
        }
        testFinished = true;
        console.log('Bundled worker deserialized protobuf longs as numbers.');
    } finally {
        clearTimeout(timeout);
        server.forceShutdown();
        await stopWorker(workerProcess);
        fs.rmSync(appDirectory, { recursive: true, force: true });
    }
}

function stopWorker(workerProcess) {
    if (!workerProcess || workerProcess.exitCode !== null) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        const forceKill = setTimeout(() => {
            if (workerProcess.exitCode === null) {
                workerProcess.kill('SIGKILL');
            }
        }, 2000);
        forceKill.unref();

        workerProcess.once('exit', () => {
            clearTimeout(forceKill);
            resolve();
        });
        workerProcess.kill();
    });
}

main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
});
