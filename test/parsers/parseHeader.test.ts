// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import 'mocha';
import { getHeaderValue, parseContentDisposition, parseContentType } from '../../src/parsers/parseHeader';

describe('getHeaderValue', () => {
    it('normal', async () => {
        expect(getHeaderValue('content-type: text/plain', 'content-type')).to.equal('text/plain');
    });

    it('weird casing', async () => {
        expect(getHeaderValue('ConTent-TypE: text/plain', 'cOntent-type')).to.equal('text/plain');
    });

    it('weird spacing', async () => {
        expect(getHeaderValue('  Content-Type  :   text/plain  ', 'content-type')).to.equal('text/plain');
    });

    it('with parameter', async () => {
        expect(getHeaderValue('Content-Type: text/html; charset=UTF-8', 'content-type')).to.equal(
            'text/html; charset=UTF-8'
        );
    });

    it('with parameter and weird spacing', async () => {
        expect(getHeaderValue('  Content-Type:   text/html;   charset=UTF-8  ', 'content-type')).to.equal(
            'text/html;   charset=UTF-8'
        );
    });

    it('missing', async () => {
        expect(getHeaderValue('oops: text/plain', 'content-type')).to.equal(null);
    });

    it('invalid', async () => {
        expect(getHeaderValue('invalid', 'content-type')).to.equal(null);
    });
});

describe('parseContentType', () => {
    describe('getMediaType', () => {
        function getMediaType(data: string): string {
            return parseContentType(data)[0];
        }

        it('json', async () => {
            expect(getMediaType('application/json')).to.equal('application/json');
        });

        it('form', async () => {
            expect(getMediaType('multipart/form-data')).to.equal('multipart/form-data');
        });

        it('with semicolon', async () => {
            expect(getMediaType('multipart/form-data;')).to.equal('multipart/form-data');
        });

        it('with param', async () => {
            expect(getMediaType('multipart/form-data; boundary=----WebKitFormBoundaryeJGMO2YP65ZZXRmv')).to.equal(
                'multipart/form-data'
            );
        });

        it('with multiple params', async () => {
            expect(
                getMediaType('multipart/form-data; test=abc; boundary=----WebKitFormBoundaryeJGMO2YP65ZZXRmv')
            ).to.equal('multipart/form-data');
        });

        it('weird whitespace', async () => {
            expect(getMediaType('   multipart/form-data;   ')).to.equal('multipart/form-data');
        });

        it('weird whitespace with param', async () => {
            expect(
                getMediaType('   multipart/form-data;    boundary=----WebKitFormBoundaryeJGMO2YP65ZZXRmv   ')
            ).to.equal('multipart/form-data');
        });

        it('invalid', async () => {
            expect(() => getMediaType('invalid')).to.throw(/content-type.*format/i);
        });
    });

    describe('getFormBoundary', () => {
        function getFormBoundary(data: string): string {
            return parseContentType(data)[1].get('boundary');
        }

        it('normal', async () => {
            expect(getFormBoundary('multipart/form-data; boundary=----WebKitFormBoundaryeJGMO2YP65ZZXRmv')).to.equal(
                '----WebKitFormBoundaryeJGMO2YP65ZZXRmv'
            );
        });

        it('semicolon at the end', async () => {
            expect(getFormBoundary('multipart/form-data; boundary=----WebKitFormBoundaryeJGMO2YP65ZZXRmv;')).to.equal(
                '----WebKitFormBoundaryeJGMO2YP65ZZXRmv'
            );
        });

        it('different casing', async () => {
            expect(getFormBoundary('multipart/form-data; bOunDary=----WebKitFormBoundaryeJGMO2YP65ZZXRmv;')).to.equal(
                '----WebKitFormBoundaryeJGMO2YP65ZZXRmv'
            );
        });

        it('weird whitespace', async () => {
            expect(
                getFormBoundary('   multipart/form-data;    boundary=----WebKitFormBoundaryeJGMO2YP65ZZXRmv;   ')
            ).to.equal('----WebKitFormBoundaryeJGMO2YP65ZZXRmv');
        });

        it('quotes', async () => {
            expect(getFormBoundary('multipart/form-data; boundary="----WebKitFormBoundaryeJGMO2YP65ZZXRmv"')).to.equal(
                '----WebKitFormBoundaryeJGMO2YP65ZZXRmv'
            );
        });

        it('escaped quotes', async () => {
            expect(
                getFormBoundary('multipart/form-data; boundary="----WebKitFormBounda\\"rye\\"JGMO2YP65ZZXRmv"')
            ).to.equal('----WebKitFormBounda"rye"JGMO2YP65ZZXRmv');
        });

        it('multiple params', async () => {
            expect(
                getFormBoundary('multipart/form-data; test=abc; boundary=----WebKitFormBoundaryeJGMO2YP65ZZXRmv')
            ).to.equal('----WebKitFormBoundaryeJGMO2YP65ZZXRmv');
        });

        it('multiple params (switch order)', async () => {
            expect(
                getFormBoundary('multipart/form-data; boundary=----WebKitFormBoundaryeJGMO2YP65ZZXRmv; test=abc')
            ).to.equal('----WebKitFormBoundaryeJGMO2YP65ZZXRmv');
        });

        it('extra boundary inside quoted string', async () => {
            expect(
                getFormBoundary(
                    'multipart/form-data; test="boundary=nope"; boundary=----WebKitFormBoundaryeJGMO2YP65ZZXRmv'
                )
            ).to.equal('----WebKitFormBoundaryeJGMO2YP65ZZXRmv');
        });

        it('extra boundary inside quoted string (switch order)', async () => {
            expect(
                getFormBoundary(
                    'multipart/form-data; boundary=----WebKitFormBoundaryeJGMO2YP65ZZXRmv; test="boundary=nope"'
                )
            ).to.equal('----WebKitFormBoundaryeJGMO2YP65ZZXRmv');
        });

        it('missing boundary', async () => {
            expect(() => getFormBoundary('multipart/form-data; oops=----WebKitFormBoundaryeJGMO2YP65ZZXRmv')).to.throw(
                /failed to find.*boundary/i
            );
        });
    });
});

describe('parseContentDisposition', () => {
    // Largely uses the same logic as parseContentType, so only going to add a simple test
    it('normal', async () => {
        const [disposition, params] = parseContentDisposition('form-data; name=myfile; filename="test.txt"');
        expect(disposition).to.equal('form-data');
        expect(params.get('name')).to.equal('myfile');
        expect(params.get('filename')).to.equal('test.txt');
    });
});
