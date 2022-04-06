// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { HttpRequestHeaders, HttpRequestUser } from '@azure/functions';
import { expect } from 'chai';
import 'mocha';
import { v4 as uuid } from 'uuid';
import { extractHttpUserFromHeaders } from '../../src/http/extractHttpUserFromHeaders';

describe('Extract Http User Claims Principal from Headers', () => {
    it('Correctly parses AppService headers', () => {
        const username = 'test@example.com';
        const id: string = uuid();
        const provider = 'aad';
        const claimsPrincipalData = {
            auth_typ: provider,
            claims: [
                {
                    typ: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
                    val: username,
                },
                { typ: 'name', val: 'Example Test' },
                { typ: 'nonce', val: '54b39eaa5596466f9336b9369e91d95e_20211117004911' },
                {
                    typ: 'http://schemas.microsoft.com/identity/claims/objectidentifier',
                    val: id,
                },
                { typ: 'preferred_username', val: username },
                { typ: 'ver', val: '2.0' },
            ],
            name_typ: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
            role_typ: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role',
        };

        const headers: HttpRequestHeaders = {
            'x-ms-client-principal-name': username,
            'x-ms-client-principal-id': id,
            'x-ms-client-principal-idp': provider,
            'x-ms-client-principal': Buffer.from(JSON.stringify(claimsPrincipalData)).toString('base64'),
        };

        const user: HttpRequestUser | null = extractHttpUserFromHeaders(headers);

        expect(user).to.not.be.null;
        expect(user?.type).to.equal('AppService');
        expect(user?.id).to.equal(id);
        expect(user?.username).to.equal(username);
        expect(user?.identityProvider).to.equal(provider);
        expect(user?.claimsPrincipalData).to.deep.equal(claimsPrincipalData);
    });

    it('Correctly parses StaticWebApps headers', () => {
        const id = uuid();
        const username = 'test@example.com';
        const provider = 'aad';
        const claimsPrinicipalData = {
            userId: id,
            userRoles: ['anonymous', 'authenticated'],
            identityProvider: provider,
            userDetails: username,
        };

        const headers: HttpRequestHeaders = {
            'x-ms-client-principal': Buffer.from(JSON.stringify(claimsPrinicipalData)).toString('base64'),
        };

        const user: HttpRequestUser | null = extractHttpUserFromHeaders(headers);

        expect(user).to.not.be.null;
        expect(user?.type).to.equal('StaticWebApps');
        expect(user?.id).to.equal(id);
        expect(user?.username).to.equal(username);
        expect(user?.identityProvider).to.equal(provider);
        expect(user?.claimsPrincipalData).to.deep.equal(claimsPrinicipalData);
    });

    it('Correctly returns null on missing header data', () => {
        const headers: HttpRequestHeaders = {
            key1: 'val1',
        };

        const user: HttpRequestUser | null = extractHttpUserFromHeaders(headers);

        expect(user).to.be.null;
    });
});
