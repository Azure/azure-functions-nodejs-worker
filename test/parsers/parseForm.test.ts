// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import 'mocha';
import { parseForm } from '../../src/parsers/parseForm';

describe('parseForm', () => {
    describe('multipart', () => {
        const contentType = 'multipart/form-data; boundary=----WebKitFormBoundaryeJGMO2YP65ZZXRmv';

        it('hello world', async () => {
            const data = Buffer.from(`------WebKitFormBoundaryeJGMO2YP65ZZXRmv
Content-Disposition: form-data; name="name"

Azure Functions
------WebKitFormBoundaryeJGMO2YP65ZZXRmv
Content-Disposition: form-data; name="greeting"

Hello
------WebKitFormBoundaryeJGMO2YP65ZZXRmv--
`);

            const parsedForm = parseForm(data, contentType);
            expect(parsedForm.length).to.equal(2);

            expect(parsedForm.has('name')).to.equal(true);
            expect(parsedForm.get('name')).to.deep.equal({
                value: Buffer.from('Azure Functions'),
            });

            expect(parsedForm.has('greeting')).to.equal(true);
            expect(parsedForm.get('greeting')).to.deep.equal({
                value: Buffer.from('Hello'),
            });
        });

        it('file', async () => {
            const data = Buffer.from(`------WebKitFormBoundaryeJGMO2YP65ZZXRmv
Content-Disposition: form-data; name="myfile"; filename="test.txt"
Content-Type: text/plain

hello
world
------WebKitFormBoundaryeJGMO2YP65ZZXRmv--
`);

            const parsedForm = parseForm(data, contentType);
            expect(parsedForm.length).to.equal(1);
            expect(parsedForm.has('myfile')).to.equal(true);
            expect(parsedForm.get('myfile')).to.deep.equal({
                value: Buffer.from(`hello
world`),
                fileName: 'test.txt',
                contentType: 'text/plain',
            });
        });

        it('empty field', async () => {
            const data = Buffer.from(`------WebKitFormBoundaryeJGMO2YP65ZZXRmv
Content-Disposition: form-data; name="emptyfield"

------WebKitFormBoundaryeJGMO2YP65ZZXRmv--
`);

            const parsedForm = parseForm(data, contentType);
            expect(parsedForm.length).to.equal(1);
            expect(parsedForm.has('emptyfield')).to.equal(true);
            expect(parsedForm.get('emptyfield')).to.deep.equal({
                value: Buffer.from(''),
            });
        });

        it('empty file', async () => {
            const data = Buffer.from(`------WebKitFormBoundaryeJGMO2YP65ZZXRmv
Content-Disposition: form-data; name="myemptyfile"; filename="emptyTest.txt"
Content-Type: text/plain

------WebKitFormBoundaryeJGMO2YP65ZZXRmv--
`);

            const parsedForm = parseForm(data, contentType);
            expect(parsedForm.length).to.equal(1);
            expect(parsedForm.has('myemptyfile')).to.equal(true);
            expect(parsedForm.get('myemptyfile')).to.deep.equal({
                value: Buffer.from(''),
                fileName: 'emptyTest.txt',
                contentType: 'text/plain',
            });
        });

        it('empty form', async () => {
            const data = Buffer.from('');

            const parsedForm = parseForm(data, contentType);
            expect(parsedForm.length).to.equal(0);
        });

        it('duplicate parts', async () => {
            const data = Buffer.from(`------WebKitFormBoundaryeJGMO2YP65ZZXRmv
Content-Disposition: form-data; name="dupeField"

value1
------WebKitFormBoundaryeJGMO2YP65ZZXRmv
Content-Disposition: form-data; name="dupeField"

value2
------WebKitFormBoundaryeJGMO2YP65ZZXRmv--
`);

            const parsedForm = parseForm(data, contentType);
            expect(parsedForm.length).to.equal(2);
            expect(parsedForm.has('dupeField')).to.equal(true);
            expect(parsedForm.get('dupeField')).to.deep.equal({
                value: Buffer.from('value1'),
            });

            expect(parsedForm.getAll('dupeField')).to.deep.equal([
                {
                    value: Buffer.from('value1'),
                },
                {
                    value: Buffer.from('value2'),
                },
            ]);
        });

        it('weird casing and whitespace', async () => {
            const data = Buffer.from(`------WebKitFormBoundaryeJGMO2YP65ZZXRmv
    CoNtent-DispOsItion  : forM-dAta  ;   naMe="wEirdCasing"  ;   fILename="tEsT.txt"
 COnteNt-tYpe:   texT/plaIn  

  hello  
------WebKitFormBoundaryeJGMO2YP65ZZXRmv--
`);
            const parsedForm = parseForm(data, contentType);
            expect(parsedForm.has('wEirdCasing')).to.equal(true);
            expect(parsedForm.get('wEirdCasing')).to.deep.equal({
                value: Buffer.from('  hello  '),
                fileName: 'tEsT.txt',
                contentType: 'texT/plaIn',
            });
        });

        it('\\n', async () => {
            const data = Buffer.from(
                `------WebKitFormBoundaryeJGMO2YP65ZZXRmv\nContent-Disposition: form-data; name="hello"\n\nworld\n------WebKitFormBoundaryeJGMO2YP65ZZXRmv--\n`
            );

            const parsedForm = parseForm(data, contentType);
            expect(parsedForm.has('hello')).to.equal(true);
            expect(parsedForm.get('hello')).to.deep.equal({
                value: Buffer.from('world'),
            });
        });

        it('\\r\\n', async () => {
            const data = Buffer.from(
                `------WebKitFormBoundaryeJGMO2YP65ZZXRmv\r\nContent-Disposition: form-data; name="hello"\r\n\r\nworld\r\n------WebKitFormBoundaryeJGMO2YP65ZZXRmv--\r\n`
            );

            const parsedForm = parseForm(data, contentType);
            expect(parsedForm.has('hello')).to.equal(true);
            expect(parsedForm.get('hello')).to.deep.equal({
                value: Buffer.from('world'),
            });
        });

        it('html file with charset', async () => {
            const data = Buffer.from(`------WebKitFormBoundaryeJGMO2YP65ZZXRmv
Content-Disposition: form-data; name="htmlfile"; filename="test.html"
Content-Type: text/html; charset=UTF-8

<h1>Hi</h1>
------WebKitFormBoundaryeJGMO2YP65ZZXRmv--
`);

            const parsedForm = parseForm(data, contentType);
            expect(parsedForm.length).to.equal(1);
            expect(parsedForm.has('htmlfile')).to.equal(true);
            expect(parsedForm.get('htmlfile')).to.deep.equal({
                value: Buffer.from('<h1>Hi</h1>'),
                fileName: 'test.html',
                contentType: 'text/html; charset=UTF-8',
            });
        });

        it('Missing content-disposition', async () => {
            const data = Buffer.from(`------WebKitFormBoundaryeJGMO2YP65ZZXRmv
Content-oops: form-data; name="name"

Azure Functions
------WebKitFormBoundaryeJGMO2YP65ZZXRmv--
`);

            expect(() => parseForm(data, contentType)).to.throw(/expected.*content-disposition/i);
        });

        it('Missing content-disposition name', async () => {
            const data = Buffer.from(`------WebKitFormBoundaryeJGMO2YP65ZZXRmv
Content-Disposition: form-data; nameOops="name"

Azure Functions
------WebKitFormBoundaryeJGMO2YP65ZZXRmv--
`);

            expect(() => parseForm(data, contentType)).to.throw(/failed to find parameter/i);
        });
    });

    describe('urlencoded', () => {
        const contentType = 'application/x-www-form-urlencoded';

        it('hello world', async () => {
            const data = 'name=Azure+Functions&greeting=Hello';

            const parsedForm = parseForm(data, contentType);

            expect(parsedForm.has('name')).to.equal(true);
            expect(parsedForm.get('name')).to.deep.equal({
                value: Buffer.from('Azure Functions'),
            });

            expect(parsedForm.has('greeting')).to.equal(true);
            expect(parsedForm.get('greeting')).to.deep.equal({
                value: Buffer.from('Hello'),
            });
        });
    });

    it('Unsupported content type', async () => {
        const expectedError = /media type.*does not match/i;
        expect(() => parseForm('', 'application/octet-stream')).to.throw(expectedError);
        expect(() => parseForm('', 'application/json')).to.throw(expectedError);
        expect(() => parseForm('', 'text/plain')).to.throw(expectedError);
    });

    it('Invalid content type', async () => {
        expect(() => parseForm('', 'invalid')).to.throw(/content-type.*format/i);
    });
});
