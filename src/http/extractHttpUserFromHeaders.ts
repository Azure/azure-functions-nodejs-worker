// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { HttpRequestHeaders, HttpRequestUser } from '@azure/functions';

export function extractHttpUserFromHeaders(headers: HttpRequestHeaders): HttpRequestUser | null {
    let user: HttpRequestUser | null = null;

    if (headers['x-ms-client-principal']) {
        const claimsPrincipalData = JSON.parse(
            Buffer.from(headers['x-ms-client-principal'], 'base64').toString('utf-8')
        );

        if (claimsPrincipalData['identityProvider']) {
            user = {
                type: 'StaticWebApps',
                id: claimsPrincipalData['userId'],
                username: claimsPrincipalData['userDetails'],
                identityProvider: claimsPrincipalData['identityProvider'],
                claimsPrincipalData,
            };
        } else {
            user = {
                type: 'AppService',
                id: headers['x-ms-client-principal-id'],
                username: headers['x-ms-client-principal-name'],
                identityProvider: headers['x-ms-client-principal-idp'],
                claimsPrincipalData,
            };
        }
    }

    return user;
}
