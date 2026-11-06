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

type PositionalFileHandle = {
    read: (
        buffer: Buffer,
        offset: number,
        length: number,
        position: number | null
    ) => Promise<fs.FileReadResult<Buffer>>;
};

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
    let warnings: sinon.SinonSpy;

    function createSnapshot(getRoot: () => string | undefined = () => root): HostConfigurationSnapshot {
        return new HostConfigurationSnapshot(warnings, getRoot);
    }

    function expectWarning(reason: string): void {
        expect(
            warnings.calledOnceWithExactly(
                `Host configuration could not be delivered to the host. Reason: ${reason}. The failure is retained until the worker process restarts.`
            )
        ).to.be.true;
    }

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(__dirname, 'host-configuration-'));
        filePath = path.join(root, 'host.json');
        sandbox = sinon.createSandbox();
        warnings = sandbox.spy();
        snapshot = createSnapshot();
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
            snapshot = createSnapshot(rootAccessor);
            const open = sandbox.spy(fs, 'open');
            const stat = sandbox.spy(fs, 'stat');
            expect(await snapshot.getConfiguration({ capabilities })).to.be.undefined;
            expect(rootAccessor.called).to.be.false;
            expect(open.called).to.be.false;
            expect(stat.called).to.be.false;
            expect(warnings.called).to.be.false;

            await fs.writeFile(filePath, '{}');
            expect(await snapshot.getConfiguration(requested)).to.deep.equal({
                status: Status.Available,
                content: Buffer.from('{}'),
            });
            expect(rootAccessor.calledOnce).to.be.true;
            expect(warnings.called).to.be.false;
        });
    }

    for (const value of [undefined, '', ' \t\r\n', '\0']) {
        it(`reports Error for invalid root ${JSON.stringify(value)}`, async () => {
            snapshot = createSnapshot(() => value);
            expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Error });
            expectWarning(value === '\0' ? 'OpenFailed' : 'AppDirectoryNotSet');
        });
    }

    it('caches a root accessor exception without exposing it', async () => {
        const getRoot = sandbox.stub().throws(new Error('secret-root-accessor-path'));
        snapshot = createSnapshot(getRoot);
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Error });
        getRoot.returns(root);
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Error });
        expect(getRoot.calledOnce).to.be.true;
        expectWarning('AppDirectoryUnavailable');
    });

    it('reports path construction failures without opening the file', async () => {
        sandbox.stub(path, 'sep').get(() => {
            throw new Error('secret-path-construction');
        });
        const open = sandbox.spy(fs, 'open');
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Error });
        expectWarning('AppDirectoryInvalid');
        expect(open.called).to.be.false;
    });

    it('accepts an explicitly configured relative root', async () => {
        await fs.writeFile(filePath, '{}');
        snapshot = createSnapshot(() => path.relative(process.cwd(), root));
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({
            status: Status.Available,
            content: Buffer.from('{}'),
        });
    });

    it('leaves relative-root normalization to the native filesystem', async () => {
        await fs.writeFile(filePath, '{}');
        const configuredRoot = root + path.sep + '..' + path.sep + path.basename(root);
        const open = sandbox.spy(fs, 'open');
        snapshot = createSnapshot(() => configuredRoot);
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({
            status: Status.Available,
            content: Buffer.from('{}'),
        });
        expect(open.firstCall.args[0]).to.equal(configuredRoot + path.sep + 'host.json');
    });

    const rootPaths = [
        { separator: '\\', root: 'C:', expected: 'C:host.json' },
        { separator: '\\', root: 'c:', expected: 'c:host.json' },
        { separator: '\\', root: '\\', expected: '\\host.json' },
        { separator: '\\', root: '/', expected: '/host.json' },
        { separator: '\\', root: 'C:\\', expected: 'C:\\host.json' },
        { separator: '\\', root: 'C:\\app\\', expected: 'C:\\app\\host.json' },
        { separator: '\\', root: 'C:/app/', expected: 'C:/app/host.json' },
        { separator: '\\', root: '\\\\server\\share\\', expected: '\\\\server\\share\\host.json' },
        { separator: '\\', root: 'C:relative', expected: 'C:relative\\host.json' },
        { separator: '\\', root: 'app\\..\\content', expected: 'app\\..\\content\\host.json' },
        { separator: '/', root: '/', expected: '/host.json' },
        { separator: '/', root: '//', expected: '//host.json' },
        { separator: '/', root: '/app/', expected: '/app/host.json' },
        { separator: '/', root: 'C:', expected: 'C:/host.json' },
        { separator: '/', root: 'dir\\', expected: 'dir\\/host.json' },
        { separator: '/', root: 'app/../content', expected: 'app/../content/host.json' },
    ];
    for (const { separator, root: configuredRoot, expected } of rootPaths) {
        it(`joins configured roots natively: ${JSON.stringify(configuredRoot)} with ${JSON.stringify(
            separator
        )}`, async () => {
            sandbox.stub(path, 'sep').value(separator);
            const open = sandbox.stub(fs, 'open').rejects(new Error('synthetic read failure'));
            snapshot = createSnapshot(() => configuredRoot);
            expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Error });
            expect(open.calledOnceWithExactly(expected, 'r')).to.be.true;
        });
    }

    it('reads from a directory root ending in a native separator', async () => {
        await fs.writeFile(filePath, '{}');
        snapshot = createSnapshot(() => root + path.sep);
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({
            status: Status.Available,
            content: Buffer.from('{}'),
        });
    });

    it('reports Missing only when the root directory exists', async () => {
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Missing });
        expect(warnings.called).to.be.false;
        snapshot = createSnapshot(() => path.join(root, 'missing-directory'));
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Error });
        expectWarning('AppDirectoryNotFound');
        await fs.writeFile(filePath, '{}');
        snapshot = createSnapshot(() => filePath);
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
            expectWarning(
                code === 'EACCES' || code === 'EPERM'
                    ? 'AccessDenied'
                    : code === 'ENOTDIR'
                    ? 'AppDirectoryNotFound'
                    : 'OpenFailed'
            );
        });
    }

    it('reports Error when the root cannot be inspected after ENOENT', async () => {
        sandbox.stub(fs, 'stat').rejects(new Error('secret-root-path'));
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Error });
        expectWarning('OpenFailed');
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
            expectWarning('ReadFailed');
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
        expectWarning('ReadFailed');
    });

    it('classifies a SyntaxError from reading as ReadFailed rather than InvalidJson', async () => {
        await fs.writeFile(filePath, '{}');
        const handle = await fs.open(filePath, 'r');
        sandbox.stub(fs, 'open').resolves(handle);
        sandbox.stub(handle, 'read').rejects(new SyntaxError('secret-read-error'));
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Error });
        expectWarning('ReadFailed');
    });

    it('classifies ENOENT on close as ReadFailed rather than Missing', async () => {
        await fs.writeFile(filePath, '{}');
        const handle = await fs.open(filePath, 'r');
        const close = handle.close.bind(handle);
        sandbox.stub(fs, 'open').resolves(handle);
        sandbox.stub(handle, 'close').callsFake(async () => {
            await close();
            throw Object.assign(new Error('secret-close-path'), { code: 'ENOENT' });
        });
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Error });
        expectWarning('ReadFailed');
    });

    for (const encoding of encodings) {
        it(`rejects empty or BOM-only ${encoding} input as InvalidJson`, async () => {
            await fs.writeFile(filePath, encode('', encoding));
            const open = sandbox.spy(fs, 'open');
            const [first, second] = await Promise.all([
                snapshot.getConfiguration(requested),
                snapshot.getConfiguration(requested),
            ]);
            expect(first).to.deep.equal({ status: Status.Error });
            expect(second).to.deep.equal(first);
            expect(second).not.to.equal(first);
            await fs.writeFile(filePath, '{}');
            expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Error });
            expect(open.calledOnce).to.be.true;
            expectWarning('InvalidJson');
        });

        for (const text of [
            '{}',
            '{"text":"\u00e9\u20ac\ud83d\ude00"}',
            '{"text":"\ufeff"}',
            '{"text":"\ufffd"}',
            '{"text":"\\uD800"}',
            '{"n":1E+2}',
        ]) {
            it(`preserves ${encoding} JSON tokens ${JSON.stringify(text)}`, async () => {
                await fs.writeFile(filePath, encode(text, encoding));
                expect(await snapshot.getConfiguration(requested)).to.deep.equal({
                    status: Status.Available,
                    content: Buffer.from(text),
                });
                expect(warnings.called).to.be.false;
            });
        }

        it(`normalizes comments and trailing commas after strict ${encoding} decoding`, async () => {
            await fs.writeFile(filePath, encode('/* before */ { "x": "\ufffd", "x": 1e999, } // after', encoding));
            expect(await snapshot.getConfiguration(requested)).to.deep.equal({
                status: Status.Available,
                content: Buffer.from('{"x":"\ufffd","x":1e999}'),
            });
            expect(warnings.called).to.be.false;
        });

        for (const size of [65535, 65536, 65537]) {
            it(`limits converted ${encoding} output to 65536 bytes (${size})`, async () => {
                const text = '{"k":"' + 'x'.repeat(size - 8) + '"}';
                expect(Buffer.byteLength(text)).to.equal(size);
                await fs.writeFile(filePath, encode(text, encoding));
                expect(await snapshot.getConfiguration(requested)).to.deep.equal(
                    size <= 65536
                        ? { status: Status.Available, content: Buffer.from(text) }
                        : { status: Status.TooLarge }
                );
            });
        }

        it(`handles ${encoding} multibyte sequences crossing read boundaries`, async () => {
            const prefix = '{"k":"';
            const text = prefix + 'a'.repeat(4095 - prefix.length) + '\ud83d\ude00\u00e9\u20ac'.repeat(1000) + '"}';
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
                const count = Math.floor((size - 8) / 3);
                const text = '{"k":"' + '\u0800'.repeat(count) + 'x'.repeat(size - 8 - count * 3) + '"}';
                expect(Buffer.byteLength(text)).to.equal(size);
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
            expectWarning('InvalidEncoding');
        });
    }

    it('rejects a truncated sequence after an otherwise maximum-size payload', async () => {
        await fs.writeFile(filePath, Buffer.concat([Buffer.alloc(65536, 0x61), Buffer.from([0xe2, 0x82])]));
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Error });
        expectWarning('InvalidEncoding');
    });

    it('bounds reading and closes the file on TooLarge', async () => {
        await fs.writeFile(filePath, Buffer.alloc(1024 * 1024, 0x61));
        const handle = await fs.open(filePath, 'r');
        sandbox.stub(fs, 'open').resolves(handle);
        const read = sandbox.spy<PositionalFileHandle, 'read'>(handle, 'read');
        const close = sandbox.spy(handle, 'close');
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.TooLarge });
        expectWarning('Oversized');
        expect(read.callCount).to.be.at.most(18);
        expect(close.calledOnce).to.be.true;
        for (const call of read.getCalls()) {
            expect(call.args[2]).to.be.at.most(4096);
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
                .stub<PositionalFileHandle, 'read'>(handle, 'read')
                .callsFake((buffer, offset, length, position) => read(buffer, offset, Math.min(length, 1), position));
            expect(await snapshot.getConfiguration(requested)).to.deep.equal({
                status: Status.Available,
                content: Buffer.from(text),
            });
        });
    }

    it('shares in-flight acquisition and returns independent immutable snapshots', async () => {
        await fs.writeFile(filePath, '{"value":"original"}');
        const handle = await fs.open(filePath, 'r');
        let release!: (file: fs.FileHandle) => void;
        const open = sandbox.stub(fs, 'open').returns(new Promise((resolve) => (release = resolve)));
        const getRoot = sandbox.spy(() => root);
        snapshot = createSnapshot(getRoot);
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
        await fs.writeFile(filePath, '{"value":"changed"}');
        expect(await snapshot.getConfiguration(requested)).to.deep.equal({
            status: Status.Available,
            content: Buffer.from('{"value":"original"}'),
        });
        expect(open.calledOnce).to.be.true;
        expect(warnings.called).to.be.false;
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
            if (status === Status.Missing) {
                expect(warnings.called).to.be.false;
            } else {
                expectWarning(status === Status.Error ? 'InvalidEncoding' : 'Oversized');
            }
        });
    }

    const normalizationCases = [
        [' \r\n{ "a": 1, /* comment */ "b": [true, false, null,], } // end', '{"a":1,"b":[true,false,null]}'],
        ['// before\r\n/* before */ [ /* empty */ ] /* after */', '[]'],
        ['{ /* empty */ }', '{}'],
        ['[1,// trailing\n]', '[1]'],
        ['[1,/* trailing */]', '[1]'],
        ['[{} , [] , [1,], {"k":2,},]', '[{},[],[1],{"k":2}]'],
        ['{ "x": 1, "x": 2, "\\u0078": 3 }', '{"x":1,"x":2,"\\u0078":3}'],
        ['{"__proto__":{"k":1},"constructor":2}', '{"__proto__":{"k":1},"constructor":2}'],
        [
            '[-0, 1E+2, 1e999, 9007199254740993, 0.12345678901234567890123456789]',
            '[-0,1E+2,1e999,9007199254740993,0.12345678901234567890123456789]',
        ],
        ['{ "\\uD800": "\\uDFFF", "reversed": "\\uDC00\\uD800" }', '{"\\uD800":"\\uDFFF","reversed":"\\uDC00\\uD800"}'],
        ['"\\u12345\\/\\\\\\"\\b\\f\\n\\r\\t"', '"\\u12345\\/\\\\\\"\\b\\f\\n\\r\\t"'],
        ['"literal // /* */ comma, braces{} brackets[]"', '"literal // /* */ comma, braces{} brackets[]"'],
        ['true // final', 'true'],
        ['false /* final */', 'false'],
        ['null\r\n', 'null'],
        [' -1.25e-10 ', '-1.25e-10'],
        [' "root" ', '"root"'],
        ['{}// NUL \0 inside a comment', '{}'],
    ];
    for (const [source, expected] of normalizationCases) {
        it(`normalizes without changing raw tokens: ${JSON.stringify(source)}`, async () => {
            await fs.writeFile(filePath, '{"value":' + source + '\n}');
            expect(await snapshot.getConfiguration(requested)).to.deep.equal({
                status: Status.Available,
                content: Buffer.from('{"value":' + expected + '}'),
            });
            expect(warnings.called).to.be.false;
        });
    }

    for (const char of ['\u2028', '\u2029']) {
        for (const [source, expected] of [
            [`/* ${char} */ {"${char}":"${char}"} /* ${char} */`, `{"${char}":"${char}"}`],
            [`// before\r"${char}"`, `"${char}"`],
            [`// before\n"${char}"`, `"${char}"`],
        ]) {
            it(`preserves Unicode in strings/block comments: ${JSON.stringify(source)}`, async () => {
                await fs.writeFile(filePath, '{"value":' + source + '\n}');
                expect(await snapshot.getConfiguration(requested)).to.deep.equal({
                    status: Status.Available,
                    content: Buffer.from('{"value":' + expected + '}'),
                });
            });
        }
    }

    const invalidJson = [
        ' ',
        '\r\n\t',
        '// comment',
        '/* comment */',
        '{malformed',
        '\ufeff{}',
        '{} {}',
        '1 2',
        '1/* comment */2',
        'true false',
        'truefalse',
        'null0',
        '[,]',
        '{,}',
        '[1,,]',
        '{"a":1,,}',
        '{"a":,}',
        '[1,}',
        '{"a":1,]',
        '[1 2]',
        '{"a" 1}',
        '{"a":1 "b":2}',
        '[1',
        '{"a":1',
        ']',
        '01',
        '-01',
        '+1',
        '.1',
        '1.',
        '1e',
        '1e+',
        '--1',
        'NaN',
        'Infinity',
        '"unterminated',
        '"\\x20"',
        '"\\u123"',
        '"\\u12xz"',
        '"raw\nnewline"',
        '"raw\0null"',
        '{}/* unterminated',
        '/ not a comment',
        '{} // \u2028',
        '{} // \u2029',
        '// \u2028\n{}',
        '// \u2029\n{}',
        '[1,\u2028 2]',
        '[1,\u2029 2]',
        '\u00a0{}',
        '{}\ufeff',
    ];
    for (const source of invalidJson) {
        it(`rejects invalid JSON without exposing its content: ${JSON.stringify(source)}`, async () => {
            await fs.writeFile(filePath, '{"value":' + source + '\n}');
            expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Error });
            expectWarning('InvalidJson');
        });
    }

    for (const depth of [64, 65]) {
        for (const object of [false, true]) {
            it(`limits ${object ? 'object' : 'array'} nesting to 64 containers (${depth})`, async () => {
                const nested =
                    (object ? '{"k":' : '[').repeat(depth - 1) + '0' + (object ? '}' : ']').repeat(depth - 1);
                const source = '{"k":' + nested + '}';
                await fs.writeFile(filePath, source);
                expect(await snapshot.getConfiguration(requested)).to.deep.equal(
                    depth === 64 ? { status: Status.Available, content: Buffer.from(source) } : { status: Status.Error }
                );
                if (depth === 65) {
                    expectWarning('InvalidJson');
                }
            });
        }
    }

    for (const source of [' '.repeat(65534) + '{}', '/*' + 'x'.repeat(65530) + '*/{}']) {
        it('accepts 65536 converted bytes that compact to two bytes', async () => {
            expect(Buffer.byteLength(source)).to.equal(65536);
            await fs.writeFile(filePath, source);
            expect(await snapshot.getConfiguration(requested)).to.deep.equal({
                status: Status.Available,
                content: Buffer.from('{}'),
            });
        });
    }

    for (const source of [' '.repeat(65535) + '{}', ' '.repeat(65537), '{' + 'x'.repeat(65536)]) {
        it('enforces the converted limit before normalization/JSON validation', async () => {
            await fs.writeFile(filePath, source);
            expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.TooLarge });
            expectWarning('Oversized');
        });
    }

    for (const source of [
        '{"secret-json-value":',
        '[]',
        '[7]',
        '"s"',
        '1',
        'null',
        'true',
        'false',
        '// c\n[1]',
        '/* c */ "s"',
        ' \t\r\n',
        '// c',
        '/* c */',
    ]) {
        it(`caches InvalidJson with one warning for an invalid object root: ${JSON.stringify(source)}`, async () => {
            await fs.writeFile(filePath, source);
            const open = sandbox.spy(fs, 'open');
            const [first, second] = await Promise.all([
                snapshot.getConfiguration(requested),
                snapshot.getConfiguration(requested),
            ]);
            expect(first).to.deep.equal({ status: Status.Error });
            expect(second).to.deep.equal(first);
            expect(second).not.to.equal(first);
            first!.status = Status.Available;
            await fs.writeFile(filePath, '{}');
            expect(await snapshot.getConfiguration(requested)).to.deep.equal({ status: Status.Error });
            expect(await snapshot.getConfiguration({})).to.be.undefined;
            expect(open.calledOnce).to.be.true;
            expectWarning('InvalidJson');
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
