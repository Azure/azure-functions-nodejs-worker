// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import 'mocha';
import { getContentType, getFormBoundary } from '../src/form-data/parseContentType';

describe('getContentType', () => {
    it('json', async () => {
        expect(getContentType('application/json')).to.equal('application/json');
    });

    it('form', async () => {
        expect(getContentType('multipart/form-data')).to.equal('multipart/form-data');
    });

    it('with semicolon', async () => {
        expect(getContentType('multipart/form-data;')).to.equal('multipart/form-data');
    });

    it('with part', async () => {
        expect(getContentType('multipart/form-data; boundary=----WebKitFormBoundaryeJGMO2YP65ZZXRmv')).to.equal(
            'multipart/form-data'
        );
    });

    it('with multiple parts', async () => {
        expect(
            getContentType('multipart/form-data; test=abc; boundary=----WebKitFormBoundaryeJGMO2YP65ZZXRmv')
        ).to.equal('multipart/form-data');
    });

    it('weird whitespace', async () => {
        expect(getContentType('   multipart/form-data;   ')).to.equal('multipart/form-data');
    });

    it('weird whitespace with part', async () => {
        expect(
            getContentType('   multipart/form-data;    boundary=----WebKitFormBoundaryeJGMO2YP65ZZXRmv   ')
        ).to.equal('multipart/form-data');
    });
});

describe('getFormBoundary', () => {
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

    it('multiple parts', async () => {
        expect(
            getFormBoundary('multipart/form-data; test=abc; boundary=----WebKitFormBoundaryeJGMO2YP65ZZXRmv')
        ).to.equal('----WebKitFormBoundaryeJGMO2YP65ZZXRmv');
    });

    it('multiple parts (switch order)', async () => {
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
});
