// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import 'mocha';
import { Readable } from 'stream';
import { FormEntrySimple, parseFormSimple } from '../src/form-data/parseForm';

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

function verifyHelloWorldForm(parsedForm: FormEntrySimple[]): void {
    expect(parsedForm).to.have.length(3);
    const entry1 = parsedForm[0];
    expect(entry1.name).to.equal('name');
    expect(entry1.value).to.equal('Azure Functions');
    expect(entry1.fileName).to.equal(undefined);
    expect(entry1.contentType).to.equal(undefined);

    const entry2 = parsedForm[1];
    expect(entry2.name).to.equal('greeting');
    expect(entry2.value).to.equal('Hello');
    expect(entry2.fileName).to.equal(undefined);
    expect(entry2.contentType).to.equal(undefined);

    const entry3 = parsedForm[2];
    expect(entry3.name).to.equal('myfile');
    expect(entry3.value).to.equal(`hello
world`);
    expect(entry3.fileName).to.equal('test.txt');
    expect(entry3.contentType).to.equal('text/plain');
}

describe('parseForm', () => {
    it('hello world form', async () => {
        const stream = new Readable();
        stream.push(helloFormData);
        stream.push(null); // signal it's done

        const parsedForm = await parseFormSimple(stream, boundary);
        verifyHelloWorldForm(parsedForm);
    });

    it('hello world form with boundary split in chunks', async () => {
        const stream = new Readable();
        const index = 127;
        const pieces = [helloFormData.substring(0, index), helloFormData.substring(index)];
        for (const piece of pieces) {
            stream.push(piece);
        }
        stream.push(null); // signal it's done

        const parsedForm = await parseFormSimple(stream, boundary);
        verifyHelloWorldForm(parsedForm);
    });
});
