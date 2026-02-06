// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

export const version = '3.12.0';
export const upgradeUrl = 'https://aka.ms/functions-nodejs-supported-versions';

// https://github.com/nodejs/Release
export const NODE_EOL_DATES: Record<string, string> = {
    v14: '2023-04',
    v16: '2023-09',
    v18: '2025-04',
    v20: '2026-04',
    v22: '2027-04',
    v24: '2028-04',
};

/**
 * When set to "true", disables verbose system logging from the worker.
 * By default, all system logs are emitted (backward compatible).
 * Setting this to "true" suppresses system logs at Warning level and below
 * (Trace, Debug, Information, Warning), only allowing Error and Critical through.
 * This reduces latency by minimizing gRPC messages to the host.
 */
export const verboseLoggingKey = 'AZURE_FUNCTIONS_NODE_DISABLE_VERBOSE_LOGGING';

export function isEnvironmentVariableSet(val: string | boolean | number | undefined | null): boolean {
    return !/^(false|0)?$/i.test(val === undefined || val === null ? '' : String(val));
}

export const NODE_EOL_WARNING_DATES: Record<string, string> = {
    v14: '2022-10',
    v16: '2023-03',
    v18: '2024-10',
    v20: '2025-10',
    v22: '2026-10',
    v24: '2027-10',
};
