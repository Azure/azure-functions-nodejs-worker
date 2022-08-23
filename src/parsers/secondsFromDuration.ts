// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

import { google } from '../../azure-functions-language-worker-protobuf/src/rpc';
import { InternalException } from '../utils/InternalException';

export function secondsFromDuration(duration: google.protobuf.IDuration): Number {
    const seconds = duration.seconds;
    const nanos = duration.nanos;
    if (!seconds && !nanos) {
        throw new InternalException('Duration empty');
    }
    return Number(seconds) + Number(nanos) * 0.000000001;
}
