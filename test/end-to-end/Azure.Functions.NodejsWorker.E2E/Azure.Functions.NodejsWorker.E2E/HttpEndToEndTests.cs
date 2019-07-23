// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

using System.Net;
using System.Threading.Tasks;
using Xunit;

namespace Azure.Functions.NodeJs.Tests.E2E
{
    [Collection(Constants.FunctionAppCollectionName)]
    public class HttpEndToEndTests 
    {
        private readonly FunctionAppFixture _fixture;

        public HttpEndToEndTests(FunctionAppFixture fixture)
        {
            _fixture = fixture;
        }

        [Theory]
        [InlineData("HttpTrigger", "?name=Test", HttpStatusCode.OK, "Hello Test")]
        [InlineData("HttpTrigger", "?name=John&lastName=Doe", HttpStatusCode.OK, "Hello John")]
        [InlineData("HttpTriggerThrows", "", HttpStatusCode.InternalServerError, "")]
        [InlineData("HttpTrigger", "", HttpStatusCode.BadRequest, "Please pass a name on the query string or in the request body")]
        public async Task HttpTriggerTests(string functionName, string queryString, HttpStatusCode expectedStatusCode, string expectedMessage)
        {
            // TODO: Verify exception on 500 after https://github.com/Azure/azure-functions-host/issues/3589
            Assert.True(await Utilities.InvokeHttpTrigger(functionName, queryString, expectedStatusCode, expectedMessage));
        }

        [Theory]
        [InlineData("HttpTriggerBodyAndRawBody", "{\"a\":1}", "application/json", HttpStatusCode.OK)]
        [InlineData("HttpTriggerBodyAndRawBody", "{\"a\":1, \"b\":}", "application/json", HttpStatusCode.OK)]
        [InlineData("HttpTriggerBodyAndRawBody", "{\"a\":1}", "application/octet-stream", HttpStatusCode.OK)]
        [InlineData("HttpTriggerBodyAndRawBody", "abc", "text/plain", HttpStatusCode.OK)]

        public async Task HttpTriggerTestsWithCustomMediaType(string functionName, string queryString, string mediaType, HttpStatusCode expectedStatusCode)
        {
            Assert.True(await Utilities.InvokeHttpTriggerWithBody(functionName, queryString, expectedStatusCode, mediaType));
        }

        [Fact(Skip = "Not yet enabled.")]
        public async Task HttpTriggerWithCookieTests()
        {
            Assert.True(await Utilities.InvokeHttpTrigger("HttpTriggerSetsCookie", "", HttpStatusCode.OK, "mycookie=myvalue, mycookie2=myvalue2"));
        }
    }
}