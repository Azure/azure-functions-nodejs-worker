// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import 'mocha';
import { expect } from 'chai';
import * as fs from 'fs/promises';
import { worker } from '../../src/WorkerContext';
import { beforeEventHandlerSuite } from './beforeEventHandlerSuite';
import { msg } from './msg';
import { setTestAppMainField, testAppPath, testAppSrcPath, testPackageJsonPath } from './testAppUtils';
import { TestEventStream } from './TestEventStream';

describe('FunctionEnvironmentReloadHandler', () => {
    let stream: TestEventStream;

    before(() => {
        stream = beforeEventHandlerSuite();
    });

    afterEach(async () => {
        await stream.afterEachEventHandlerTest();
    });

    async function mockPlaceholderInit(): Promise<void> {
        stream.addTestMessage(msg.init.request('pathWithoutPackageJson'));
        await stream.assertCalledWith(msg.init.receivedRequestLog, msg.noPackageJsonWarning, msg.init.response);
    }

    it('reloads environment variables', async () => {
        process.env.PlaceholderVariable = 'TRUE';
        stream.addTestMessage({
            requestId: 'testReqId',
            functionEnvironmentReloadRequest: {
                environmentVariables: {
                    hello: 'world',
                    SystemDrive: 'Q:',
                },
                functionAppDirectory: null,
            },
        });
        await stream.assertCalledWith(
            msg.envReload.funcAppDirNotDefined,
            msg.envReload.reloadEnvVarsLog(2),
            msg.envReload.response
        );
        expect(process.env.hello).to.equal('world');
        expect(process.env.SystemDrive).to.equal('Q:');
        expect(process.env.PlaceholderVariable).to.be.undefined;
    });

    it('preserves OS-specific casing behavior of environment variables', async () => {
        process.env.PlaceholderVariable = 'TRUE';
        stream.addTestMessage({
            requestId: 'testReqId',
            functionEnvironmentReloadRequest: {
                environmentVariables: {
                    hello: 'world',
                    SystemDrive: 'Q:',
                },
                functionAppDirectory: null,
            },
        });
        await stream.assertCalledWith(
            msg.envReload.funcAppDirNotDefined,
            msg.envReload.reloadEnvVarsLog(2),
            msg.envReload.response
        );
        expect(process.env.hello).to.equal('world');
        expect(process.env.SystemDrive).to.equal('Q:');
        expect(process.env.PlaceholderVariable).to.be.undefined;
        expect(process.env.placeholdervariable).to.be.undefined;
        if (process.platform === 'win32') {
            expect(process.env.HeLlO).to.equal('world');
            expect(process.env.systemdrive).to.equal('Q:');
        } else {
            expect(process.env.HeLlO).to.be.undefined;
            expect(process.env.systemdrive).to.be.undefined;
        }
    });

    it('reloading environment variables removes existing environment variables', async () => {
        process.env.PlaceholderVariable = 'TRUE';
        process.env.NODE_ENV = 'Debug';
        stream.addTestMessage({
            requestId: 'testReqId',
            functionEnvironmentReloadRequest: {
                environmentVariables: {},
                functionAppDirectory: null,
            },
        });
        await stream.assertCalledWith(
            msg.envReload.funcAppDirNotDefined,
            msg.envReload.reloadEnvVarsLog(0),
            msg.envReload.response
        );
        expect(process.env).to.be.empty;
    });

    it('reloads empty environment variables', async () => {
        stream.addTestMessage({
            requestId: 'testReqId',
            functionEnvironmentReloadRequest: {
                environmentVariables: {},
                functionAppDirectory: null,
            },
        });
        await stream.assertCalledWith(
            msg.envReload.funcAppDirNotDefined,
            msg.envReload.reloadEnvVarsLog(0),
            msg.envReload.response
        );

        stream.addTestMessage({
            requestId: 'testReqId',
            functionEnvironmentReloadRequest: null,
        });

        await stream.assertCalledWith(msg.noHandlerError);

        stream.addTestMessage({
            requestId: 'testReqId',
            functionEnvironmentReloadRequest: {
                environmentVariables: null,
                functionAppDirectory: null,
            },
        });
        await stream.assertCalledWith(
            msg.envReload.funcAppDirNotDefined,
            msg.envReload.reloadEnvVarsLog(0),
            msg.envReload.response
        );
    });

    it('reloads environment variable and keeps cwd without functionAppDirectory', async () => {
        const cwd = process.cwd();
        stream.addTestMessage({
            requestId: 'testReqId',
            functionEnvironmentReloadRequest: {
                environmentVariables: {
                    hello: 'world',
                    SystemDrive: 'Q:',
                },
                functionAppDirectory: null,
            },
        });
        await stream.assertCalledWith(
            msg.envReload.funcAppDirNotDefined,
            msg.envReload.reloadEnvVarsLog(2),
            msg.envReload.response
        );
        expect(process.env.hello).to.equal('world');
        expect(process.env.SystemDrive).to.equal('Q:');
        expect(process.cwd() == cwd);
    });

    it('reloads environment variable and changes functionAppDirectory', async () => {
        const cwd = process.cwd();
        const newDir = '/';
        stream.addTestMessage({
            requestId: 'testReqId',
            functionEnvironmentReloadRequest: {
                environmentVariables: {
                    hello: 'world',
                    SystemDrive: 'Q:',
                },
                functionAppDirectory: newDir,
            },
        });

        await stream.assertCalledWith(
            msg.envReload.reloadEnvVarsLog(2),
            msg.envReload.changingCwdLog(),
            msg.noPackageJsonWarning,
            msg.envReload.response
        );
        expect(process.env.hello).to.equal('world');
        expect(process.env.SystemDrive).to.equal('Q:');
        expect(process.cwd() != newDir);
        expect(process.cwd() == newDir);
        process.chdir(cwd);
    });

    it('reloads package.json', async () => {
        const oldPackageJson = { type: 'module', hello: 'world' };
        await fs.writeFile(testPackageJsonPath, JSON.stringify(oldPackageJson));
        stream.addTestMessage({
            requestId: 'testReqId',
            functionEnvironmentReloadRequest: {
                functionAppDirectory: testAppPath,
            },
        });
        await stream.assertCalledWith(
            msg.envReload.reloadEnvVarsLog(0),
            msg.envReload.changingCwdLog(testAppPath),
            msg.envReload.response
        );
        expect(worker.app.packageJson).to.deep.equal(oldPackageJson);

        const newPackageJson = { type: 'commonjs', notHello: 'notWorld' };
        await fs.writeFile(testPackageJsonPath, JSON.stringify(newPackageJson));
        stream.addTestMessage({
            requestId: 'testReqId',
            functionEnvironmentReloadRequest: {
                functionAppDirectory: testAppPath,
            },
        });
        await stream.assertCalledWith(
            msg.envReload.funcAppDirNotChanged,
            msg.envReload.reloadEnvVarsLog(0),
            msg.envReload.changingCwdLog(testAppPath),
            msg.envReload.response
        );
        expect(worker.app.packageJson).to.deep.equal(newPackageJson);
    });

    it('loads package.json (placeholder scenario)', async () => {
        const packageJson = { type: 'module', hello: 'world' };
        await fs.writeFile(testPackageJsonPath, JSON.stringify(packageJson));

        await mockPlaceholderInit();
        expect(worker.app.packageJson).to.be.empty;

        stream.addTestMessage({
            requestId: 'testReqId',
            functionEnvironmentReloadRequest: {
                functionAppDirectory: testAppPath,
            },
        });
        await stream.assertCalledWith(
            msg.envReload.reloadEnvVarsLog(0),
            msg.envReload.changingCwdLog(testAppPath),
            msg.envReload.response
        );
        expect(worker.app.packageJson).to.deep.equal(packageJson);
    });

    for (const extension of ['.js', '.mjs', '.cjs']) {
        it(`Loads entry point (${extension}) (placeholder scenario)`, async () => {
            const fileSubpath = await setTestAppMainField(`doNothing${extension}`);

            await mockPlaceholderInit();

            stream.addTestMessage({
                requestId: 'testReqId',
                functionEnvironmentReloadRequest: {
                    functionAppDirectory: testAppPath,
                },
            });
            await stream.assertCalledWith(
                msg.envReload.reloadEnvVarsLog(0),
                msg.envReload.changingCwdLog(testAppPath),
                msg.loadingEntryPoint(fileSubpath),
                msg.loadedEntryPoint(fileSubpath),
                msg.envReload.response
            );
        });
    }

    for (const isIndexingOnByDefault of [true, false]) {
        it(`registerFunction for placeholders (indexing on by default: ${isIndexingOnByDefault})`, async () => {
            const fileName = 'registerFunction.js';
            const fileSubpath = await setTestAppMainField(fileName);
            await mockPlaceholderInit();

            if (isIndexingOnByDefault) {
                stream.addTestMessage({
                    requestId: 'testReqId',
                    functionsMetadataRequest: {
                        functionAppDirectory: 'pathWithoutPackageJson',
                    },
                });
                await stream.assertCalledWith(msg.indexing.receivedRequestLog, msg.indexing.response([], true));
            }

            stream.addTestMessage({
                requestId: 'testReqId',
                functionEnvironmentReloadRequest: {
                    functionAppDirectory: testAppPath,
                },
            });
            await stream.assertCalledWith(
                msg.envReload.reloadEnvVarsLog(0),
                msg.envReload.changingCwdLog(testAppPath),
                msg.loadingEntryPoint(fileSubpath),
                msg.loadedEntryPoint(fileSubpath),
                msg.envReload.response
            );

            stream.addTestMessage(msg.indexing.request);
            await stream.assertCalledWith(
                msg.indexing.receivedRequestLog,
                msg.indexing.response(
                    [
                        {
                            bindings: {},
                            directory: testAppSrcPath,
                            functionId: 'testFunc',
                            name: 'testFunc',
                            rawBindings: [],
                            scriptFile: fileName,
                        },
                    ],
                    false
                )
            );
        });
    }

    it('runs app start hooks (placeholder scenario)', async () => {
        const fileSubpath = await setTestAppMainField('registerAppStartHook.js');
        await mockPlaceholderInit();

        stream.addTestMessage({
            requestId: 'testReqId',
            functionEnvironmentReloadRequest: {
                functionAppDirectory: testAppPath,
            },
        });
        await stream.assertCalledWith(
            msg.envReload.reloadEnvVarsLog(0),
            msg.envReload.changingCwdLog(testAppPath),
            msg.loadingEntryPoint(fileSubpath),
            msg.loadedEntryPoint(fileSubpath),
            msg.executingAppHooksLog(1, 'appStart'),
            msg.executedAppHooksLog('appStart'),
            msg.envReload.response
        );
    });
});
