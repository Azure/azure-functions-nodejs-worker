// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { systemError, systemLog } from '../utils/Logger';
import { AggregatedHealthMetric, BufferedLogEntry } from './types';

/**
 * Result from an AI summary request.
 */
export interface AISummaryResult {
    /** The generated summary text */
    summary: string;
    /** The prompts that were used */
    prompts: string[];
    /** ISO 8601 timestamp of when the summary was generated */
    generatedAt: string;
}

/**
 * Client for generating AI-powered summaries via Azure OpenAI Foundry Responses API.
 *
 * Supports two modes:
 * - **Per-invocation**: Summarize a single invocation's logs using a customer prompt.
 * - **Per-window (1 min)**: Summarize aggregated health metrics + collected logs for a time window.
 */
export class AISummaryClient {
    #endpoint: string;
    #apiKey: string;
    #model: string;
    #maxTokens: number;

    constructor(endpoint: string, apiKey: string, model = 'gpt-4o', maxTokens = 1024) {
        this.#endpoint = endpoint;
        this.#apiKey = apiKey;
        this.#model = model;
        this.#maxTokens = maxTokens;
    }

    /**
     * Generate an AI summary for a single invocation's logs.
     *
     * @param prompts - Customer-provided prompt list describing what to analyze
     * @param functionName - Name of the function
     * @param invocationId - Invocation identifier
     * @param logs - Buffered log entries from the invocation
     * @param succeeded - Whether the invocation succeeded
     * @param durationMs - Invocation duration
     */
    async summarizeInvocation(
        prompts: string[],
        functionName: string,
        invocationId: string,
        logs: BufferedLogEntry[],
        succeeded: boolean,
        durationMs: number,
        error?: { message: string; stack?: string }
    ): Promise<AISummaryResult | undefined> {
        const systemMessage = [
            'You are an Azure Functions diagnostics assistant.',
            'You are analyzing logs from a single function invocation.',
            `Function: ${functionName}`,
            `Invocation ID: ${invocationId}`,
            `Outcome: ${succeeded ? 'Success' : 'Failure'}`,
            `Duration: ${durationMs}ms`,
            error ? `Error: ${error.message}` : '',
            '',
            'The user has provided a prompt to guide your analysis.',
            'Respond concisely with actionable insights.',
        ]
            .filter(Boolean)
            .join('\n');

        const logsText = this.#formatLogs(logs);
        const promptsSection = this.#formatPrompts(prompts);
        const userMessage = `${promptsSection}\n\n--- Invocation Logs ---\n${logsText}`;

        return this.#callFoundryAPI(systemMessage, userMessage, prompts);
    }

    /**
     * Generate an AI summary for a 1-minute aggregation window.
     *
     * @param prompts - Customer-provided prompt list describing what to analyze
     * @param metrics - Aggregated health metrics for the window
     * @param windowLogs - Collected error/warning logs from the window (sampled)
     */
    async summarizeWindow(
        prompts: string[],
        metrics: AggregatedHealthMetric[],
        windowLogs: BufferedLogEntry[]
    ): Promise<AISummaryResult | undefined> {
        const metricsText = metrics
            .map(
                (m) =>
                    `[${m.functionName}] invocations=${m.invocationCount}, success=${m.successCount}, ` +
                    `failures=${m.failureCount}, errorRate=${(m.errorRate * 100).toFixed(1)}%, ` +
                    `p50=${m.durationP50}ms, p95=${m.durationP95}ms, p99=${m.durationP99}ms, ` +
                    `errors=${m.totalErrorCount}, logs=${m.totalLogCount}`
            )
            .join('\n');

        const windowRange =
        const systemMessage = [
            'You are an Azure Functions diagnostics assistant.',
            'You are analyzing aggregated metrics from a 1-minute time window.',
            `Window: ${windowRange}`,
            `Functions reporting: ${metrics.length}`,
            '',
            'The user has provided a prompt to guide your analysis.',
            'Respond concisely with actionable insights, trends, and any concerns.',
        ].join('\n');

        const logsText = windowLogs.length > 0 ? this.#formatLogs(windowLogs) : '(no error/warning logs in window)';

        const promptsSection = this.#formatPrompts(prompts);
        const userMessage = `${promptsSection}\n\n--- Aggregated Metrics ---\n${metricsText}\n\n--- Sampled Error/Warning Logs ---\n${logsText}`;

        return this.#callFoundryAPI(systemMessage, userMessage, prompts);
    }

    async #callFoundryAPI(
        systemMessage: string,
        userMessage: string,
        originalPrompts: string[]
    ): Promise<AISummaryResult | undefined> {
        try {
            const body = JSON.stringify({
                model: this.#model,
                input: [
                    { role: 'system', content: systemMessage },
                    { role: 'user', content: userMessage },
                ],
                max_output_tokens: this.#maxTokens,
            });

            const { request: httpsRequest } = await import('https');
            const parsedUrl = new URL(this.#endpoint);

            const responseText = await new Promise<string>((resolve, reject) => {
                const req = httpsRequest(
                    {
                        hostname: parsedUrl.hostname,
                        path: parsedUrl.pathname + parsedUrl.search,
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'api-key': this.#apiKey,
                            'Content-Length': Buffer.byteLength(body),
                        },
                    },
                    (res) => {
                        let data = '';
                        res.on('data', (chunk: Buffer) => (data += chunk.toString()));
                        res.on('end', () => {
                            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                                resolve(data);
                            } else {
                                reject(
                                    new Error(`Azure OpenAI API returned ${res.statusCode}: ${data.substring(0, 500)}`)
                                );
                            }
                        });
                    }
                );

                req.on('error', reject);
                req.write(body);
                req.end();
            });

            const parsed = JSON.parse(responseText);

            // Foundry Responses API returns output array with message items
            let summary = '';
            if (parsed.output && Array.isArray(parsed.output)) {
                for (const item of parsed.output) {
                    if (item.type === 'message' && item.content) {
                        for (const content of item.content) {
                            if (content.type === 'output_text') {
                                summary += content.text;
                            }
                        }
                    }
                }
            }

            if (!summary) {
                systemError('[AISummaryClient] No summary text in API response');
                return undefined;
            }

            systemLog(`[AISummaryClient] Generated summary (${summary.length} chars)`);

            return {
                summary,
                prompts: originalPrompts,
                generatedAt: new Date().toISOString(),
            };
        } catch (err) {
            systemError('[AISummaryClient] Failed to generate summary:', err);
            return undefined;
        }
    }

    #formatLogs(logs: BufferedLogEntry[], maxEntries = 200): string {
        const subset = logs.slice(0, maxEntries);
        return subset.map((l) => `[${l.timestamp}] [${l.level}] [${l.category}] ${l.message}`).join('\n');
    }

    #formatPrompts(prompts: string[]): string {
        if (prompts.length === 1) {
            return prompts[0];
        }
        return prompts.map((p, i) => `${i + 1}. ${p}`).join('\n');
    }
}
