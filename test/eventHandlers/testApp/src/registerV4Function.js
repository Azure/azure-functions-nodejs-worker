// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

const func = require('@azure/functions-core');

func.setProgrammingModel({ name: '@azure/functions', version: '4.12.0' });
func.registerFunction({ name: 'testFunc', bindings: [] }, () => {});
