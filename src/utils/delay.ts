// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

export async function delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}
