// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { createHash } from 'crypto';

/**
 * Error fingerprinting module.
 *
 * Generates stable, short fingerprints for errors so that identical errors
 * can be grouped/deduplicated in metrics without sending full error text
 * to Application Insights.
 *
 * The fingerprint is a truncated SHA-256 hash of the normalized error signature.
 */

/**
 * Normalize an error message by stripping variable parts (numbers, paths, UUIDs, timestamps)
 * so that structurally identical errors produce the same fingerprint.
 */
function normalizeMessage(message: string): string {
    return (
        message
            // Strip UUIDs: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
            .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
            // Strip hex addresses: 0x1a2b3c
            .replace(/0x[0-9a-fA-F]+/g, '<HEX>')
            // Strip absolute paths (Windows and Unix)
            .replace(/[A-Z]:\\[\w\\.-]+/gi, '<PATH>')
            .replace(/\/[\w/.-]+/g, '<PATH>')
            // Strip numeric values (port numbers, line numbers, etc.)
            .replace(/\b\d{2,}\b/g, '<NUM>')
            // Strip timestamps (ISO 8601)
            .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, '<TIMESTAMP>')
            // Collapse whitespace
            .replace(/\s+/g, ' ')
            .trim()
    );
}

/**
 * Extract a stable signature from a stack trace by taking the top N frames
 * and normalizing them.
 */
function normalizeStack(stack: string | undefined, topFrames = 3): string {
    if (!stack) {
        return '';
    }

    const lines = stack.split('\n');
    const frames = lines
        .filter((line) => line.trim().startsWith('at '))
        .slice(0, topFrames)
        .map((frame) => {
            // Keep function name but normalize file paths and line numbers
            return frame
                .trim()
                .replace(/\(.*\)/, '(<LOCATION>)')
                .replace(/at\s+/, '');
        });

    return frames.join('|');
}

/**
 * Generate a stable error fingerprint from an error's message and stack trace.
 *
 * @param message - The error message
 * @param stack - The error stack trace (optional)
 * @returns A 16-character hex fingerprint
 */
export function generateErrorFingerprint(message: string, stack?: string): string {
    const normalizedMsg = normalizeMessage(message);
    const normalizedStack = normalizeStack(stack);
    const signature = `${normalizedMsg}::${normalizedStack}`;
    return createHash('sha256').update(signature).digest('hex').substring(0, 16);
}

/**
 * Check if two errors have the same fingerprint.
 */
export function isSameError(
    msg1: string,
    stack1: string | undefined,
    msg2: string,
    stack2: string | undefined
): boolean {
    return generateErrorFingerprint(msg1, stack1) === generateErrorFingerprint(msg2, stack2);
}
