// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
    const args = {
        buildHost: false,
        hostRepo: path.resolve(repoRoot, '..', 'azure-functions-host'),
        port: 7079,
        timeoutSeconds: 120,
        workerDir: repoRoot,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        switch (arg) {
            case '--build-host':
                args.buildHost = true;
                break;
            case '--host-repo':
                args.hostRepo = path.resolve(readValue(argv, ++i, arg));
                break;
            case '--port':
                args.port = parseInt(readValue(argv, ++i, arg), 10);
                break;
            case '--timeout-seconds':
                args.timeoutSeconds = parseInt(readValue(argv, ++i, arg), 10);
                break;
            case '--worker-dir':
                args.workerDir = path.resolve(readValue(argv, ++i, arg));
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return args;
}

function readValue(argv, index, name) {
    const value = argv[index];
    if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${name}`);
    }

    return value;
}

function run(command, args, options = {}) {
    const result = childProcess.spawnSync(command, args, {
        stdio: 'inherit',
        shell: process.platform === 'win32',
        ...options,
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
    }
}

function writeSampleApp() {
    const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-worker-host-sanity-'));
    const functionDir = path.join(appDir, 'HttpTrigger');
    fs.mkdirSync(functionDir, { recursive: true });

    fs.writeFileSync(path.join(appDir, 'host.json'), JSON.stringify({ version: '2.0' }, null, 2));
    fs.writeFileSync(
        path.join(functionDir, 'function.json'),
        JSON.stringify(
            {
                bindings: [
                    {
                        authLevel: 'anonymous',
                        type: 'httpTrigger',
                        direction: 'in',
                        name: 'req',
                        methods: ['get', 'post'],
                    },
                    {
                        type: 'http',
                        direction: 'out',
                        name: 'res',
                    },
                ],
            },
            null,
            2
        )
    );
    fs.writeFileSync(
        path.join(functionDir, 'index.js'),
        "module.exports = async function (context, req) {\n" +
            "    const name = (req.query && req.query.name) || 'world';\n" +
            "    context.res = { status: 200, body: `Hello, ${name}. Node ${process.version}` };\n" +
            "};\n"
    );

    return appDir;
}

function request(url) {
    return new Promise((resolve) => {
        const req = http.get(url, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                resolve({ statusCode: res.statusCode, body });
            });
        });

        req.on('error', (error) => {
            resolve({ error });
        });
        req.setTimeout(2000, () => {
            req.destroy(new Error('Request timed out'));
        });
    });
}

function killProcessTree(processId) {
    if (!processId) {
        return;
    }

    if (process.platform === 'win32') {
        childProcess.spawnSync('taskkill', ['/pid', String(processId), '/T', '/F'], { stdio: 'ignore' });
    } else {
        try {
            process.kill(-processId, 'SIGTERM');
        } catch (_error) {
            try {
                process.kill(processId, 'SIGTERM');
            } catch (_ignored) {
                // Best effort cleanup.
            }
        }
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const hostProject = path.join(args.hostRepo, 'src', 'WebJobs.Script.WebHost', 'WebJobs.Script.WebHost.csproj');
    const workerEntryPoint = path.join(args.workerDir, 'dist', 'src', 'nodejsWorker.js');
    const workerBundle = path.join(args.workerDir, 'dist', 'src', 'worker-bundle.js');
    const workerConfig = path.join(args.workerDir, 'worker.config.json');

    for (const requiredPath of [hostProject, workerEntryPoint, workerBundle, workerConfig]) {
        if (!fs.existsSync(requiredPath)) {
            throw new Error(`Required path does not exist: ${requiredPath}`);
        }
    }

    const nodeVersion = childProcess.execFileSync(process.execPath, ['--version'], { encoding: 'utf8' }).trim();
    console.log(`Node runtime: ${nodeVersion}`);
    console.log(`Host repo:    ${args.hostRepo}`);
    console.log(`Worker dir:   ${args.workerDir}`);

    if (args.buildHost) {
        run('dotnet', ['build', hostProject, '-c', 'Debug']);
    }

    const appDir = writeSampleApp();
    const url = `http://127.0.0.1:${args.port}`;
    const endpoint = `${url}/api/HttpTrigger?name=SanityTest`;
    const hostOutput = [];
    let hostProcess;

    try {
        hostProcess = childProcess.spawn(
            'dotnet',
            ['run', '--no-build', '--no-launch-profile', '-c', 'Debug', '--project', hostProject, '--urls', url],
            {
                env: {
                    ...process.env,
                    AzureWebJobsScriptRoot: appDir,
                    AzureWebJobsSecretStorageType: 'files',
                    AzureWebJobsStorage: 'UseDevelopmentStorage=true',
                    FUNCTIONS_WORKER_RUNTIME: 'node',
                    languageWorkers__node__workerDirectory: args.workerDir,
                    logging__logLevel__Worker: 'Debug',
                },
                detached: process.platform !== 'win32',
                stdio: ['ignore', 'pipe', 'pipe'],
            }
        );

        hostProcess.stdout.on('data', (data) => hostOutput.push(data.toString()));
        hostProcess.stderr.on('data', (data) => hostOutput.push(data.toString()));

        const deadline = Date.now() + args.timeoutSeconds * 1000;
        let lastResult;
        while (Date.now() < deadline) {
            lastResult = await request(endpoint);
            if (lastResult.statusCode === 200) {
                console.log(`HTTP status: ${lastResult.statusCode}`);
                console.log(`Response:    ${lastResult.body}`);
                return;
            }

            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        const status = lastResult && lastResult.statusCode ? lastResult.statusCode : 'no response';
        let errorMessage = '';
        if (lastResult && lastResult.error) {
            errorMessage = lastResult.error.message || lastResult.error;
        }
        const error = errorMessage ? ` (${errorMessage})` : '';
        throw new Error(`Host sanity test failed. Last HTTP status: ${status}${error}\n${hostOutput.join('').slice(-8000)}`);
    } finally {
        if (hostProcess) {
            killProcessTree(hostProcess.pid);
        }
        fs.rmSync(appDir, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
});
