// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

module.exports = async function (context, request) {
    context.log('legacy:hello');
    return { body: `Legacy ${request.query.name}` };
};
