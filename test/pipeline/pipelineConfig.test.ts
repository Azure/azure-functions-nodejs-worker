// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import { loadPipelineConfig, validatePipelineConfig } from '../../src/pipeline/pipelineConfig';
import { PipelineConfig } from '../../src/pipeline/types';

describe('pipelineConfig', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        // Restore original env vars
        for (const key of Object.keys(process.env)) {
            if (key.startsWith('AZURE_FUNCTIONS_METRICS_PIPELINE_')) {
                delete process.env[key];
            }
        }
        // Restore any original values
        Object.assign(process.env, originalEnv);
    });

    describe('loadPipelineConfig', () => {
        it('should return disabled config by default', () => {
            const config = loadPipelineConfig();
            expect(config.enabled).to.be.false;
        });

        it('should enable when env var is set', () => {
            process.env['AZURE_FUNCTIONS_METRICS_PIPELINE_ENABLED'] = 'true';
            const config = loadPipelineConfig();
            expect(config.enabled).to.be.true;
        });

        it('should read blob connection string', () => {
            process.env['AZURE_FUNCTIONS_METRICS_PIPELINE_ENABLED'] = 'true';
            process.env['AZURE_FUNCTIONS_METRICS_PIPELINE_BLOB_CONNECTION_STRING'] =
                'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=abc123;EndpointSuffix=core.windows.net';
            const config = loadPipelineConfig();
            expect(config.blobConnectionString).to.contain('AccountName=test');
        });

        it('should use default container name', () => {
            const config = loadPipelineConfig();
            expect(config.blobContainerName).to.equal('function-logs');
        });

        it('should read custom container name', () => {
            process.env['AZURE_FUNCTIONS_METRICS_PIPELINE_BLOB_CONTAINER'] = 'my-logs';
            const config = loadPipelineConfig();
            expect(config.blobContainerName).to.equal('my-logs');
        });

        it('should default compress to true', () => {
            const config = loadPipelineConfig();
            expect(config.compressLogs).to.be.true;
        });

        it('should read numeric settings', () => {
            process.env['AZURE_FUNCTIONS_METRICS_PIPELINE_SPIKE_THRESHOLD'] = '0.3';
            process.env['AZURE_FUNCTIONS_METRICS_PIPELINE_SPIKE_WINDOW_SIZE'] = '100';
            process.env['AZURE_FUNCTIONS_METRICS_PIPELINE_CASCADE_THRESHOLD'] = '10';
            const config = loadPipelineConfig();
            expect(config.spikeErrorRateThreshold).to.equal(0.3);
            expect(config.spikeWindowSize).to.equal(100);
            expect(config.cascadeThreshold).to.equal(10);
        });

        it('should fall back to APPLICATIONINSIGHTS_CONNECTION_STRING', () => {
            process.env['APPLICATIONINSIGHTS_CONNECTION_STRING'] = 'InstrumentationKey=test-key-123';
            const config = loadPipelineConfig();
            expect(config.appInsightsConnectionString).to.equal('InstrumentationKey=test-key-123');
        });
    });

    describe('validatePipelineConfig', () => {
        it('should return no warnings for disabled config', () => {
            const config: PipelineConfig = {
                enabled: false,
                blobContainerName: 'logs',
                compressLogs: true,
                spikeErrorRateThreshold: 0.5,
                spikeWindowSize: 50,
                cascadeThreshold: 5,
                aggregationIntervalMs: 60000,
                maxLogsPerInvocation: 10000,
                blobUploadMaxRetries: 3,
                enableHealthMetrics: true,
                aiModel: 'gpt-4o',
                aiMaxTokens: 1024,
                enableAISummaries: false,
                defaultInvocationPrompts: ['test'],
                defaultAggregationPrompts: ['test'],
                aiWindowLogSampleSize: 50,
                functionPrompts: new Map(),
            };
            const warnings = validatePipelineConfig(config);
            expect(warnings).to.have.lengthOf(0);
        });

        it('should warn when enabled but no storage configured', () => {
            const config: PipelineConfig = {
                enabled: true,
                blobContainerName: 'logs',
                compressLogs: true,
                spikeErrorRateThreshold: 0.5,
                spikeWindowSize: 50,
                cascadeThreshold: 5,
                aggregationIntervalMs: 60000,
                maxLogsPerInvocation: 10000,
                blobUploadMaxRetries: 3,
                enableHealthMetrics: true,
                aiModel: 'gpt-4o',
                aiMaxTokens: 1024,
                enableAISummaries: false,
                defaultInvocationPrompts: ['test'],
                defaultAggregationPrompts: ['test'],
                aiWindowLogSampleSize: 50,
                functionPrompts: new Map(),
            };
            const warnings = validatePipelineConfig(config);
            expect(warnings.length).to.be.greaterThan(0);
            expect(warnings[0]).to.contain('neither Blob Storage nor App Insights');
        });

        it('should warn about invalid spike threshold', () => {
            const config: PipelineConfig = {
                enabled: true,
                blobConnectionString: 'something',
                blobContainerName: 'logs',
                compressLogs: true,
                spikeErrorRateThreshold: 2.0,
                spikeWindowSize: 50,
                cascadeThreshold: 5,
                aggregationIntervalMs: 60000,
                maxLogsPerInvocation: 10000,
                blobUploadMaxRetries: 3,
                enableHealthMetrics: true,
                aiModel: 'gpt-4o',
                aiMaxTokens: 1024,
                enableAISummaries: false,
                defaultInvocationPrompts: ['test'],
                defaultAggregationPrompts: ['test'],
                aiWindowLogSampleSize: 50,
                functionPrompts: new Map(),
            };
            const warnings = validatePipelineConfig(config);
            expect(warnings.some((w) => w.includes('spike threshold'))).to.be.true;
        });
    });
});
