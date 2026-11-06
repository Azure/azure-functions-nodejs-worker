// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const payload = [
    'LICENSE',
    'NOTICE.html',
    'package.json',
    'worker.config.json',
    'dist/src/nodejsWorker.js',
    'dist/src/worker-bundle.js',
];
const entrypoint = 'dist/src/nodejsWorker.js';
const workerName = 'azure-functions-nodejs-worker';

function assertNoSymlinks(filename) {
    const absolute = path.resolve(filename);
    let current = path.parse(absolute).root;
    for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
        current = path.join(current, part);
        try {
            if (fs.lstatSync(current).isSymbolicLink()) {
                throw new Error(`Symlinks are not allowed: ${current}`);
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
            return;
        }
    }
}

function inside(parent, child) {
    const relative = path.relative(parent, child);
    return (
        relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
    );
}

function tarEntry(name, content) {
    const header = Buffer.alloc(512);
    if (Buffer.byteLength(name) >= 100) {
        throw new Error(`Tar path is too long: ${name}`);
    }
    header.write(name, 0, 100, 'utf8');
    const octal = (value, offset, length) =>
        header.write(`${value.toString(8).padStart(length - 1, '0')}\0`, offset, length, 'ascii');
    octal(0o644, 100, 8);
    octal(0, 108, 8);
    octal(0, 116, 8);
    octal(content.length, 124, 12);
    octal(0, 136, 12);
    header.fill(0x20, 148, 156);
    header.write('0', 156);
    header.write('ustar\0', 257, 6);
    header.write('00', 263, 2);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
    return [header, content, Buffer.alloc((512 - (content.length % 512)) % 512)];
}

function packageByoc(source, output) {
    source = path.resolve(source);
    output = path.resolve(output);
    assertNoSymlinks(source);
    assertNoSymlinks(output);
    if (inside(source, output)) {
        throw new Error('Output must be outside the source directory');
    }

    const files = payload.map((name) => {
        const filename = path.join(source, name);
        assertNoSymlinks(filename);
        const stat = fs.lstatSync(filename);
        if (!stat.isFile() || stat.size === 0) {
            throw new Error(`Required payload must be a nonempty regular file: ${name}`);
        }
        return { name, content: fs.readFileSync(filename) };
    });
    const readJson = (name) => JSON.parse(files.find((file) => file.name === name).content.toString('utf8'));
    const pkg = readJson('package.json');
    const config = readJson('worker.config.json');
    const versionPattern =
        /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
    if (pkg.name !== workerName || typeof pkg.version !== 'string' || !versionPattern.test(pkg.version)) {
        throw new Error('package.json must have the worker name and a safe version');
    }
    if (
        pkg.main !== entrypoint ||
        config.description?.language !== 'node' ||
        config.description?.defaultExecutablePath !== 'node' ||
        config.description?.defaultWorkerPath !== entrypoint
    ) {
        throw new Error('package.json and worker.config.json must match the Node.js worker entrypoint');
    }
    const manifest = { name: pkg.name, version: pkg.version, platform: 'any', entrypoint };
    files.push({ name: 'worker-manifest.json', content: Buffer.from(`${JSON.stringify(manifest, null, 4)}\n`) });
    const tar = Buffer.concat([...files.flatMap((file) => tarEntry(file.name, file.content)), Buffer.alloc(1024)]);
    const archive = zlib.gzipSync(tar, { level: 9, mtime: 0 });
    const basename = `${workerName}-${pkg.version}.tar.gz`;
    const archivePath = path.join(output, basename);
    const checksumPath = `${archivePath}.sha256`;
    assertNoSymlinks(archivePath);
    assertNoSymlinks(checksumPath);
    fs.mkdirSync(output, { recursive: true });
    const sha256 = crypto.createHash('sha256').update(archive).digest('hex');
    fs.writeFileSync(archivePath, archive);
    fs.writeFileSync(checksumPath, `${sha256}  ${basename}\n`);
    return { archivePath, checksumPath, sha256, size: archive.length };
}

function main(args) {
    const usage =
        'Usage: node scripts/packageByoc.js --source DIR --output DIR\nPackages an already built worker; output must be outside source.';
    if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
        console.log(usage);
        return;
    }
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
        const option = args[i];
        if (
            !['--source', '--output'].includes(option) ||
            !args[i + 1] ||
            args[i + 1].startsWith('--') ||
            options[option]
        ) {
            throw new Error(usage);
        }
        options[option] = args[i + 1];
    }
    if (!options['--source'] || !options['--output']) {
        throw new Error(usage);
    }
    console.log(JSON.stringify(packageByoc(options['--source'], options['--output']), null, 4));
}

module.exports = { packageByoc };

if (require.main === module) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
