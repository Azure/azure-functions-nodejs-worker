// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { google } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { InternalException } from '../utils/InternalException';

export function secondsFromDuration(duration: google.protobuf.IDuration): Number {
    if (!duration.seconds && !duration.nanos) {
        throw new InternalException('Duration empty');
    }

    const seconds: number | Long = duration.seconds || 0;
    const nanos: number = duration.nanos || 0;
    return Number(seconds) + Number(nanos) * 0.000000001;
}
