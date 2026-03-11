// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { systemError, systemLog } from '../utils/Logger';
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
        aiEndpoint: process.env[`${PREFIX}AI_ENDPOINT`] || undefined,
        aiApiKey: process.env[`${PREFIX}AI_API_KEY`] || undefined,
        aiModel: envStr('AI_MODEL', 'gpt-4o'),
        aiMaxTokens: envNum('AI_MAX_TOKENS', 1024),
        enableAISummaries: envBool('ENABLE_AI_SUMMARIES', false),
        defaultInvocationPrompts: loadPromptList('DEFAULT_INVOCATION_PROMPTS', [
            'Analyze these function invocation logs. Highlight any errors, performance issues, or anomalies.',
        ]),
        defaultAggregationPrompts: loadPromptList('AGGREGATION_PROMPTS', [
            'Summarize the health of these Azure Functions over the last minute. Flag any error spikes, latency regressions, or concerning patterns.',
        ]),
        aiWindowLogSampleSize: envNum('AI_WINDOW_LOG_SAMPLE_SIZE', 50),
        functionPrompts: loadFunctionPrompts(),
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
        if (config.enableAISummaries && config.aiEndpoint) {
            systemLog(`  AI Summaries: enabled (model=${config.aiModel})`);
            if (config.functionPrompts.size > 0) {
                systemLog(`  AI per-function prompts: ${[...config.functionPrompts.keys()].join(', ')}`);
            }
        } else if (config.enableAISummaries) {
            systemLog(`  AI Summaries: enabled but no endpoint configured`);
        }
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

        if (config.enableAISummaries && !config.aiEndpoint) {
            warnings.push(
                'AI summaries are enabled but no AI endpoint is configured. Summaries will not be generated.'
            );
        }

        if (config.enableAISummaries && !config.aiApiKey) {
            warnings.push('AI summaries are enabled but no API key is configured. Summaries will not be generated.');
        }
    }

    return warnings;
}

/**
 * Load per-function AI prompt lists from environment variables.
 *
 * Supports two formats:
 *
 * 1. **JSON bulk config** — a single env var with all function prompts:
 *    `AZURE_FUNCTIONS_METRICS_PIPELINE_FUNCTION_PROMPTS` =
 *    '{"MyFunc": ["Analyze errors", "Check latency"], "OtherFunc": "Single prompt"}'
 *
 * 2. **Individual env vars** — one per function (value can be JSON array or plain string):
 *    `AZURE_FUNCTIONS_METRICS_PIPELINE_PER_INVOCATION_PROMPTS_MyFunc` = '["Check errors", "Monitor latency"]'
 *    `AZURE_FUNCTIONS_METRICS_PIPELINE_PER_INVOCATION_PROMPTS_OtherFunc` = 'Check latency patterns'
 *
 * Individual env vars take precedence over JSON entries for the same function name.
 *
 * In local.settings.json:
 * ```json
 * {
 *   "Values": {
 *     "AZURE_FUNCTIONS_METRICS_PIPELINE_FUNCTION_PROMPTS": "{\"MyFunc\": [\"Analyze errors\", \"Check latency\"]}",
 *     "AZURE_FUNCTIONS_METRICS_PIPELINE_PER_INVOCATION_PROMPTS_OtherFunc": "[\"Check latency\", \"Monitor throughput\"]"
 *   }
 * }
 * ```
 */
function loadFunctionPrompts(): Map<string, string[]> {
    const prompts = new Map<string, string[]>();

    // 1. Load from JSON bulk config
    const jsonVal = process.env[`${PREFIX}FUNCTION_PROMPTS`];
    if (jsonVal) {
        try {
            const parsed = JSON.parse(jsonVal);
            if (typeof parsed === 'object' && parsed !== null) {
                for (const [funcName, value] of Object.entries(parsed)) {
                    const promptList = toPromptList(value);
                    if (promptList.length > 0) {
                        prompts.set(funcName, promptList);
                    }
                }
            }
        } catch (err) {
            systemError(
                `[PipelineConfig] Failed to parse FUNCTION_PROMPTS JSON. ` +
                    `Expected format: '{"FuncName": ["prompt1", "prompt2"]}'. Error:`,
                err
            );
        }
    }

    // 2. Load individual PER_INVOCATION_PROMPTS_<FunctionName> env vars (override JSON entries)
    const promptPrefix = `${PREFIX}PER_INVOCATION_PROMPTS_`;
    for (const [key, value] of Object.entries(process.env)) {
        if (key.startsWith(promptPrefix) && value && value.trim()) {
            const functionName = key.substring(promptPrefix.length);
            if (functionName) {
                const promptList = parsePromptValue(value.trim());
                if (promptList.length > 0) {
                    prompts.set(functionName, promptList);
                }
            }
        }
    }

    return prompts;
}

/**
 * Load a prompt list from an environment variable.
 * The value can be a JSON array string or a plain string (treated as single-item list).
 */
function loadPromptList(envKey: string, defaultValue: string[]): string[] {
    const val = process.env[`${PREFIX}${envKey}`];
    if (!val || !val.trim()) {
        return defaultValue;
    }
    return parsePromptValue(val.trim());
}

/**
 * Parse a prompt value that can be either:
 * - A JSON array: '["prompt1", "prompt2"]'
 * - A plain string: 'single prompt' (treated as a single-item array)
 */
function parsePromptValue(value: string): string[] {
    if (value.startsWith('[')) {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                return parsed.filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
            }
        } catch {
            // Not valid JSON array — treat as plain string
        }
    }
    return [value];
}

/**
 * Normalize a value from the bulk JSON config to a prompt list.
 * Accepts string, string[], or other (ignored).
 */
function toPromptList(value: unknown): string[] {
    if (typeof value === 'string' && value.trim()) {
        return [value.trim()];
    }
    if (Array.isArray(value)) {
        return value.filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
    }
    return [];
}
