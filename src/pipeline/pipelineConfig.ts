// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { systemLog } from '../utils/Logger';
import { PipelineConfig } from './types';

/**
 * Pipeline Configuration.
 *
 * Reads pipeline settings from environment variables with sensible defaults.
 * All settings are prefixed with `AZURE_FUNCTIONS_METRICS_PIPELINE_`.
 */

const PREFIX = 'AZURE_FUNCTIONS_METRICS_PIPELINE_';

function envStr(key: string, defaultValue: string): string {
    return process.env[`${PREFIX}${key}`] || defaultValue;
}

function envBool(key: string, defaultValue: boolean): boolean {
    const val = process.env[`${PREFIX}${key}`];
    if (val === undefined || val === '') {
        return defaultValue;
    }
    return val.toLowerCase() === 'true' || val === '1';
}

function envNum(key: string, defaultValue: number): number {
    const val = process.env[`${PREFIX}${key}`];
    if (val === undefined || val === '') {
        return defaultValue;
    }
    const parsed = parseFloat(val);
    return isNaN(parsed) ? defaultValue : parsed;
}

export function loadPipelineConfig(): PipelineConfig {
    let appInsightsConnectionString =
        process.env[`${PREFIX}APPINSIGHTS_CONNECTION_STRING`] ||
        process.env['APPLICATIONINSIGHTS_CONNECTION_STRING'] ||
        undefined;

    if (!appInsightsConnectionString && process.env['APPINSIGHTS_INSTRUMENTATIONKEY']) {
        appInsightsConnectionString = `InstrumentationKey=${process.env['APPINSIGHTS_INSTRUMENTATIONKEY']}`;
    }

    const config: PipelineConfig = {
        enabled: envBool('ENABLED', false),
        blobConnectionString: process.env[`${PREFIX}BLOB_CONNECTION_STRING`] || undefined,
        blobContainerName: envStr('BLOB_CONTAINER', 'function-logs'),
        appInsightsConnectionString,
        compressLogs: envBool('COMPRESS_LOGS', true),
        spikeErrorRateThreshold: envNum('SPIKE_THRESHOLD', 0.5),
        spikeWindowSize: envNum('SPIKE_WINDOW_SIZE', 50),
        cascadeThreshold: envNum('CASCADE_THRESHOLD', 5),
        aggregationIntervalMs: envNum('AGGREGATION_INTERVAL_MS', 60000),
        maxLogsPerInvocation: envNum('MAX_LOGS_PER_INVOCATION', 10000),
        blobUploadMaxRetries: envNum('BLOB_MAX_RETRIES', 3),
        enableHealthMetrics: envBool('ENABLE_HEALTH_METRICS', true),
    };

    if (config.enabled) {
        systemLog(`Metrics pipeline enabled.`);
        if (config.blobConnectionString) {
            systemLog(`  Blob Storage: container='${config.blobContainerName}', compress=${config.compressLogs}`);
        } else {
            systemLog(`  Blob Storage: NOT configured (raw logs will not be persisted)`);
        }
        if (config.appInsightsConnectionString) {
            systemLog(`  App Insights: configured`);
        } else {
            systemLog(`  App Insights: NOT configured (metrics will not be emitted)`);
        }
        systemLog(
            `  Alert detection: spikeThreshold=${config.spikeErrorRateThreshold}, ` +
                `windowSize=${config.spikeWindowSize}, cascadeThreshold=${config.cascadeThreshold}`
        );
    }

    return config;
}

export function validatePipelineConfig(config: PipelineConfig): string[] {
    const warnings: string[] = [];

    if (config.enabled) {
        if (!config.blobConnectionString && !config.appInsightsConnectionString) {
            warnings.push(
                'Pipeline is enabled but neither Blob Storage nor App Insights is configured. No data will be persisted.'
            );
        }

        if (config.spikeErrorRateThreshold < 0 || config.spikeErrorRateThreshold > 1) {
            warnings.push(
                `Invalid spike threshold ${config.spikeErrorRateThreshold}. Must be between 0 and 1. Defaulting to 0.5.`
            );
        }

        if (config.spikeWindowSize < 5) {
            warnings.push(
                `Spike window size ${config.spikeWindowSize} is very small. Consider >= 10 for meaningful detection.`
            );
        }

        if (config.aggregationIntervalMs < 10000) {
            warnings.push(`Aggregation interval ${config.aggregationIntervalMs}ms is very small. Consider >= 30000ms.`);
        }
    }

    return warnings;
}
