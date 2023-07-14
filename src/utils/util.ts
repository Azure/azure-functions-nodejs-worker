// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import * as semver from 'semver';

export function isEnvironmentVariableSet(val: string | boolean | number | undefined | null): boolean {
    return !/^(false|0)?$/i.test(val === undefined || val === null ? '' : String(val));
}

export function isNode20Plus(): boolean {
    return semver.gte(process.versions.node, '20.0.0');
}
