// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import 'mocha';
import { Readable } from 'stream';
import { parseForm } from '../src/form-data/parseForm';

const helloFormData = `------WebKitFormBoundaryeJGMO2YP65ZZXRmv
Content-Disposition: form-data; name="name"

Azure Functions
------WebKitFormBoundaryeJGMO2YP65ZZXRmv
Content-Disposition: form-data; name="greeting"

Hello
------WebKitFormBoundaryeJGMO2YP65ZZXRmv
Content-Disposition: form-data; name="myfile"; filename="test.txt"
Content-Type: text/plain

hello
world
------WebKitFormBoundaryeJGMO2YP65ZZXRmv--
`;

const boundary = '----WebKitFormBoundaryeJGMO2YP65ZZXRmv';

async function verifyHelloWorldForm(stream: Readable, message?: string): Promise<void> {
    const parsedForm = await parseForm(stream, boundary);
    expect(parsedForm).to.have.length(3, message);
    const entry1 = parsedForm[0];
    expect(entry1.name).to.equal('name', message);
    expect(entry1.value).to.equal('Azure Functions', message);
    expect(entry1.fileName).to.equal(undefined, message);
    expect(entry1.contentType).to.equal(undefined, message);

    const entry2 = parsedForm[1];
    expect(entry2.name).to.equal('greeting', message);
    expect(entry2.value).to.equal('Hello', message);
    expect(entry2.fileName).to.equal(undefined, message);
    expect(entry2.contentType).to.equal(undefined, message);

    const entry3 = parsedForm[2];
    expect(entry3.name).to.equal('myfile', message);
    expect(entry3.value).to.equal(
        `hello
world`,
        message
    );
    expect(entry3.fileName).to.equal('test.txt', message);
    expect(entry3.contentType).to.equal('text/plain', message);
}

describe('parseForm', () => {
    it('hello world form', async () => {
        const stream = new Readable();
        stream.push(helloFormData);
        stream.push(null); // signal it's done

        await verifyHelloWorldForm(stream);
    });

    it(`hello world form with data split in chunks`, async () => {
        for (let index = 1; index < helloFormData.length; index++) {
            const pieces = [helloFormData.substring(0, index), helloFormData.substring(index)];
            const stream = new TestStream(pieces);
            await verifyHelloWorldForm(stream, `(Index: ${index})`);
        }
    });

    it('hello world form with data split in multiple chunks', async () => {
        for (const gap of [1, 4, 32, 128]) {
            for (let index = 1; index < helloFormData.length - gap; index++) {
                const index1 = index;
                const index2 = index + gap;
                const pieces = [
                    helloFormData.substring(0, index1),
                    helloFormData.substring(index1, index2),
                    helloFormData.substring(index2),
                ];

                const stream = new TestStream(pieces);
                await verifyHelloWorldForm(stream, `(Index1: ${index1}, Index2: ${index2})`);
            }
        }
    });
});

class TestStream extends Readable {
    private _parts: string[];
    constructor(parts: string[]) {
        super();
        this._parts = parts;
    }

    _read() {
        const part = this._parts.shift();
        this.push(part ? Buffer.from(part) : null);
    }
}
