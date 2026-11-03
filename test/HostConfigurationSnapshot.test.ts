// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import 'mocha';
import { expect } from 'chai';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as sinon from 'sinon';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { HostConfigurationSnapshot } from '../src/HostConfigurationSnapshot';

const Status = rpc.HostConfiguration.Status;
const requested: rpc.IWorkerInitRequest = { capabilities: { HostConfiguration: '1' } };
const encodings = ['utf8', 'utf8-bom', 'utf16le', 'utf16be', 'utf32le', 'utf32be'] as const;
type Encoding = typeof encodings[number];

function encode(text: string, encoding: Encoding): Buffer {
    switch (encoding) {
        case 'utf8':
            return Buffer.from(text);
        case 'utf8-bom':
            return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]);
        case 'utf16le':
            return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
        case 'utf16be':
            return Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(text, 'utf16le').swap16()]);
        case 'utf32le':
        case 'utf32be': {
            const characters = Array.from(text);
            const buffer = Buffer.alloc((characters.length + 1) * 4);
            [0xfeff, ...characters.map((c) => c.codePointAt(0)!)].forEach((value, i) => {
                if (encoding === 'utf32le') {
                    buffer.writeUInt32LE(value, i * 4);
                } else {
                    buffer.writeUInt32BE(value, i * 4);
                }
            });
            return buffer;
        }
    }
}

describe('HostConfigurationSnapshot', () => {
    let root: string;
    let filePath: string;
    let snapshot: HostConfigurationSnapshot;
    let sandbox: sinon.SinonSandbox;

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(__dirname, 'host-configuration-'));
        filePath = path.join(root, 'host.json');
        snapshot = new HostConfigurationSnapshot(() => root);
        sandbox = sinon.createSandbox();
    });

    afterEach(async () => {
        sandbox.restore();
        await fs.rm(root, { recursive: true, force: true });
    });

    const unrequestedCapabilities: rpc.IWorkerInitRequest['capabilities'][] = [
        undefined,
        null,
        {},
        { HostConfiguration: '' },
        { HostConfiguration: '0' },
        { HostConfiguration: 'true' },
        { HostConfiguration: '01' },
        { HostConfiguration: '1 ' },
        { HostConfiguration: ' 1' },
        { hostconfiguration: '1' },
        { HOSTCONFIGURATION: '1' },
    ];
    for (const capabilities of unrequestedCapabilities) {
        it(`does no root lookup or I/O for ${JSON.stringify(capabilities)}`, async () => {
            const rootAccessor = sandbox.spy(() => root);
            snapshot = new HostConfigurationSnapshot(rootAccessor);
            const open = sandbox.spy(fs, 'open');
            const stat = sandbox.spy(fs, 'stat');
            expect(await snapshot.getConfiguration({ capabilities })).to.be.undefined;
            expect(rootAccessor.called).to.be.false;
            expect(open.called).to.be.false;
            expect(stat.called).to.be.false;

            await fs.writeFile(filePath, '{}');
            expect(await snapshot.getConfiguration(requested)).to.deep.equal({
                status: Status.Available,
                content: Buffer.from('{}'),
            });
            expect(rootAccessor.calledOnce).to.be.true;
        });
    }

    for (const value of [undefined, '', ' \t\r\n', '\0']) {
        it(`reports Error for invalid root ${JSON.stringify(value)}`, async () => {
            snapshot = new HostConfigurationSnapshot(() => value);
            expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Error });
        });
    }

    it('caches a root accessor exception without exposing it', async () => {
        const getRoot = sandbox.stub().throws(new Error('secret-root-accessor-path'));
        snapshot = new HostConfigurationSnapshot(getRoot);
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Error });
        getRoot.returns(root);
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Error });
        expect(getRoot.calledOnce).to.be.true;
    });

    it('accepts an explicitly configured relative root', async () => {
        await fs.writeFile(filePath, '{}');
        snapshot = new HostConfigurationSnapshot(() => path.relative(process.cwd(), root));
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({
            status: Status.Available,
            content: Buffer.from('{}'),
        });
    });

    it('leaves relative-root normalization to the native filesystem', async () => {
        await fs.writeFile(filePath, '{}');
        const configuredRoot = root + path.sep + '..' + path.sep + path.basename(root);
        const open = sandbox.spy(fs, 'open');
        snapshot = new HostConfigurationSnapshot(() => configuredRoot);
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({
            status: Status.Available,
            content: Buffer.from('{}'),
        });
        expect(open.firstCall.args[0]).to.equal(configuredRoot + path.sep + 'host.json');
    });

    it('reports Missing only when the root directory exists', async () => {
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Missing });
        snapshot = new HostConfigurationSnapshot(() => path.join(root, 'missing-directory'));
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Error });
        await fs.writeFile(filePath, '{}');
        snapshot = new HostConfigurationSnapshot(() => filePath);
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Error });
    });

    it('reports Error for a directory in place of host.json', async () => {
        await fs.mkdir(filePath);
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Error });
    });

    for (const code of ['EACCES', 'EPERM', 'EIO', 'ENOTDIR']) {
        it(`reports content-free Error on open ${code}`, async () => {
            sandbox.stub(fs, 'open').rejects(Object.assign(new Error('secret-open-path'), { code }));
            expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Error });
        });
    }

    it('reports Error when the root cannot be inspected after ENOENT', async () => {
        sandbox.stub(fs, 'stat').rejects(new Error('secret-root-path'));
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Error });
    });

    it('does not preflight the directory or trust file length on successful acquisition', async () => {
        await fs.writeFile(filePath, '{}');
        const handle = await fs.open(filePath, 'r');
        const close = sandbox.spy(handle, 'close');
        sandbox.stub(fs, 'open').resolves(handle);
        const stat = sandbox.stub(fs, 'stat').throws(new Error('unexpected root preflight'));
        const fileStat = sandbox.stub(handle, 'stat').throws(new Error('unexpected length lookup'));
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({
            status: Status.Available,
            content: Buffer.from('{}'),
        });
        expect(close.calledOnce).to.be.true;
        expect(stat.called).to.be.false;
        expect(fileStat.called).to.be.false;
    });

    for (const code of ['EIO', 'ENOENT']) {
        it(`reports read ${code} as Error, not Missing, and closes the file`, async () => {
            await fs.writeFile(filePath, '{}');
            const handle = await fs.open(filePath, 'r');
            sandbox.stub(fs, 'open').resolves(handle);
            sandbox.stub(handle, 'read').rejects(Object.assign(new Error('secret-read-path'), { code }));
            const close = sandbox.spy(handle, 'close');
            expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Error });
            expect(close.calledOnce).to.be.true;
        });
    }

    it('reports a close failure as a content-free Error', async () => {
        await fs.writeFile(filePath, '{}');
        const handle = await fs.open(filePath, 'r');
        const close = handle.close.bind(handle);
        sandbox.stub(fs, 'open').resolves(handle);
        sandbox.stub(handle, 'close').callsFake(async () => {
            await close();
            throw new Error('secret-close-path');
        });
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Error });
    });

    for (const encoding of encodings) {
        for (const text of ['', '{malformed', '{"text":"\u00e9\u20ac\ud83d\ude00"}', '\ufeffsecond-bom']) {
            it(`transports ${encoding} ${JSON.stringify(text)} without parsing`, async () => {
                await fs.writeFile(filePath, encode(text, encoding));
                expect(await snapshot.getConfiguration(requested)).to.deep.equal({
                    status: Status.Available,
                    content: Buffer.from(encoding === 'utf8' && text.startsWith('\ufeff') ? text.slice(1) : text),
                });
            });
        }

        for (const size of [65535, 65536, 65537]) {
            it(`limits converted ${encoding} output to 65536 bytes (${size})`, async () => {
                const text = 'x'.repeat(size);
                await fs.writeFile(filePath, encode(text, encoding));
                expect(await snapshot.getConfiguration(requested)).to.deep.equal(
                    size <= 65536
                        ? { status: Status.Available, content: Buffer.from(text) }
                        : { status: Status.TooLarge }
                );
            });
        }

        it(`handles ${encoding} multibyte sequences crossing read boundaries`, async () => {
            const text = 'a'.repeat(4095) + '\ud83d\ude00\u00e9\u20ac'.repeat(1000);
            await fs.writeFile(filePath, encode(text, encoding));
            expect(await snapshot.getConfiguration(requested)).to.deep.equal({
                status: Status.Available,
                content: Buffer.from(text),
            });
        });
    }

    for (const encoding of ['utf16le', 'utf16be'] as const) {
        for (const size of [65536, 65537]) {
            it(`measures ${encoding} expansion to ${size} UTF-8 bytes`, async () => {
                const text = '\u0800'.repeat(21845) + 'x'.repeat(size - 65535);
                const source = encode(text, encoding);
                expect(source.length).to.be.lessThan(65536);
                await fs.writeFile(filePath, source);
                expect(await snapshot.getConfiguration(requested)).to.deep.equal(
                    size === 65536
                        ? { status: Status.Available, content: Buffer.from(text) }
                        : { status: Status.TooLarge }
                );
            });
        }
    }

    const invalid = [
        [0x80],
        [0xc0, 0xaf],
        [0xed, 0xa0, 0x80],
        [0xf4, 0x90, 0x80, 0x80],
        [0xe2, 0x82],
        [0xef, 0xbb],
        [0xff, 0xfe, 0x61],
        [0xff, 0xfe, 0, 0xd8],
        [0xff, 0xfe, 0, 0xdc],
        [0xff, 0xfe, 0, 0xd8, 0x61, 0],
        [0xfe, 0xff, 0xd8, 0],
        [0xfe, 0xff, 0xdc, 0],
        [0xfe, 0xff, 0x61],
        [0xff, 0xfe, 0, 0, 0, 0xd8, 0, 0],
        [0xff, 0xfe, 0, 0, 0, 0, 0x11, 0],
        [0, 0, 0xfe, 0xff, 0, 0, 0xd8, 0],
        [0, 0, 0xfe, 0xff, 0, 0x11, 0, 0],
        [0xff, 0xfe, 0, 0, 0x61],
        [0xff, 0xfe, 0, 0, 0x61, 0],
        [0, 0, 0xfe, 0xff, 0, 0, 0],
    ];
    for (const bytes of invalid) {
        it(`rejects invalid/truncated encoding ${Buffer.from(bytes).toString('hex')}`, async () => {
            await fs.writeFile(filePath, Buffer.from(bytes));
            expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Error });
        });
    }

    it('rejects a truncated sequence after an otherwise maximum-size payload', async () => {
        await fs.writeFile(filePath, Buffer.concat([Buffer.alloc(65536, 0x61), Buffer.from([0xe2, 0x82])]));
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Error });
    });

    it('bounds reading and closes the file on TooLarge', async () => {
        await fs.writeFile(filePath, Buffer.alloc(1024 * 1024, 0x61));
        const handle = await fs.open(filePath, 'r');
        sandbox.stub(fs, 'open').resolves(handle);
        const read = sandbox.spy(handle, 'read');
        const close = sandbox.spy(handle, 'close');
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.TooLarge });
        expect(read.callCount).to.be.at.most(18);
        expect(close.calledOnce).to.be.true;
        for (const call of read.getCalls()) {
            expect(call.args[0]?.length).to.be.at.most(4096);
        }
    });

    for (const encoding of encodings) {
        it(`handles short reads splitting every ${encoding} BOM and character`, async () => {
            const text = '{"text":"\ud83d\ude00\u20ac"}';
            await fs.writeFile(filePath, encode(text, encoding));
            const handle = await fs.open(filePath, 'r');
            const read = handle.read.bind(handle);
            sandbox.stub(fs, 'open').resolves(handle);
            sandbox
                .stub(handle, 'read')
                .callsFake((options) => read({ ...options, length: Math.min(options?.length ?? 4096, 1) }));
            expect(await snapshot.getConfiguration(requested)).to.deep.equal({
                status: Status.Available,
                content: Buffer.from(text),
            });
        });
    }

    it('shares in-flight acquisition and returns independent immutable snapshots', async () => {
        await fs.writeFile(filePath, 'original');
        const handle = await fs.open(filePath, 'r');
        let release!: (file: fs.FileHandle) => void;
        const open = sandbox.stub(fs, 'open').returns(new Promise((resolve) => (release = resolve)));
        const getRoot = sandbox.spy(() => root);
        snapshot = new HostConfigurationSnapshot(getRoot);
        const first = snapshot.getConfiguration(requested);
        const second = snapshot.getConfiguration(requested);
        expect(await snapshot.getConfiguration({})).to.be.undefined;
        expect(open.calledOnce).to.be.true;
        expect(getRoot.calledOnce).to.be.true;
        release(handle);
        const [one, two] = await Promise.all([first, second]);
        expect(one).to.deep.equal(two);
        expect(one).not.to.equal(two);
        expect(one!.content).not.to.equal(two!.content);
        one!.content!.fill(0);
        one!.status = Status.Error;
        await fs.writeFile(filePath, 'changed');
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({
            status: Status.Available,
            content: Buffer.from('original'),
        });
        expect(open.calledOnce).to.be.true;
    });

    for (const status of [Status.Missing, Status.Error, Status.TooLarge]) {
        it(`caches ${Status[status]} without retrying when the source is fixed`, async () => {
            if (status !== Status.Missing) {
                await fs.writeFile(filePath, status === Status.Error ? Buffer.from([0xff]) : Buffer.alloc(65537));
            }
            const open = sandbox.spy(fs, 'open');
            const first = await snapshot.getConfiguration(requested);
            expect(first).to.deep.equal({ status });
            await fs.writeFile(filePath, '{}');
            const second = await snapshot.getConfiguration(requested);
            expect(second).to.deep.equal({ status });
            expect(first).not.to.equal(second);
            expect(open.calledOnce).to.be.true;
        });
    }

    it('encodes the pinned canonical field numbers and statuses', () => {
        expect(Status).to.include({ Unspecified: 0, Available: 1, Missing: 2, Error: 3, TooLarge: 4 });
        const bytes = rpc.WorkerInitResponse.encode({
            hostConfiguration: { status: Status.Available, content: Buffer.from('{}') },
        }).finish();
        expect(Buffer.from(bytes)).to.deep.equal(Buffer.from([0x32, 6, 8, 1, 0x12, 2, 0x7b, 0x7d]));
        expect(rpc.WorkerInitResponse.decode(bytes).hostConfiguration?.content).to.deep.equal(Buffer.from('{}'));
        expect(rpc.WorkerInitResponse.decode(rpc.WorkerInitResponse.encode({}).finish()).hostConfiguration).to.be.null;
    });
});
