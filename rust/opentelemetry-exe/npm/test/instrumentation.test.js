// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { sanitizeUrl } = require('../lib/instrumentation');

test('sanitizeUrl redacts every query value and drops credentials and fragment', () => {
    assert.equal(
        sanitizeUrl('https://user:pass@example.com/path?code=abc&token=xyz&sig=s&empty=#frag'),
        'https://example.com/path?code=REDACTED&token=REDACTED&sig=REDACTED&empty=REDACTED'
    );
});

test('sanitizeUrl keeps URLs without a query unchanged', () => {
    assert.equal(sanitizeUrl('http://example.com:8080/api/orders'), 'http://example.com:8080/api/orders');
});

test('sanitizeUrl drops the query and credentials of unparseable URLs', () => {
    assert.equal(sanitizeUrl('http://user:pw@exa mple/p?token=secret#x'), 'http://exa mple/p');
    assert.equal(sanitizeUrl('not a url?password=secret'), 'not a url');
});

test('sanitizeUrl truncates long URLs', () => {
    assert.equal(sanitizeUrl(`http://example.com/${'a'.repeat(2000)}`).length, 1024);
});
