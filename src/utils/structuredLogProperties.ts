// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { LogAttributes } from '@azure/functions-core';

export function sanitizeLogMetadata(metadata: unknown): { attributes?: LogAttributes; rejectedCount: number } {
    if (metadata === undefined) {
        return { rejectedCount: 0 };
    }
    const attributes: Record<string, string | number | boolean> = Object.create(null);
    let rejectedCount = 0;
    try {
        if (typeof metadata !== 'object' || metadata === null) {
            return { attributes: Object.freeze(attributes), rejectedCount: 1 };
        }
        const attributesDescriptor = Object.getOwnPropertyDescriptor(metadata, 'attributes');
        const suppliedAttributes: unknown = attributesDescriptor?.value;
        if (typeof suppliedAttributes !== 'object' || suppliedAttributes === null) {
            return { attributes: Object.freeze(attributes), rejectedCount: 1 };
        }
        const prototype: unknown = Object.getPrototypeOf(suppliedAttributes);
        if (prototype !== Object.prototype && prototype !== null) {
            return { attributes: Object.freeze(attributes), rejectedCount: 1 };
        }
        const descriptors = Object.getOwnPropertyDescriptors(suppliedAttributes);
        for (const property of Reflect.ownKeys(descriptors)) {
            const descriptor = Object.getOwnPropertyDescriptor(descriptors, property)?.value as PropertyDescriptor;
            if (!descriptor.enumerable) {
                continue;
            }
            const attributeValue: unknown = descriptor.value;
            if (
                typeof property !== 'string' ||
                isReservedProperty(property) ||
                !('value' in descriptor) ||
                !isAttributeValue(attributeValue)
            ) {
                rejectedCount++;
                continue;
            }
            attributes[property] = attributeValue;
        }
    } catch {
        rejectedCount++;
    }
    return { attributes: Object.freeze(attributes), rejectedCount };
}

function isReservedProperty(property: string): boolean {
    const normalized = property.toLowerCase();
    return (
        normalized === 'categoryname' ||
        normalized === '__proto__' ||
        normalized === 'prototype' ||
        normalized === 'constructor' ||
        ['exception.', '_ms', 'microsoft', 'ai.'].some((prefix) => normalized.startsWith(prefix))
    );
}

function isAttributeValue(attributeValue: unknown): attributeValue is string | number | boolean {
    return (
        typeof attributeValue === 'string' ||
        typeof attributeValue === 'boolean' ||
        (typeof attributeValue === 'number' && Number.isFinite(attributeValue))
    );
}
