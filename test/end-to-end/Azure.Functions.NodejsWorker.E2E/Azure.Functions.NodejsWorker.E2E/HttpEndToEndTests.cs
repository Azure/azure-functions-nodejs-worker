// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
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
            HttpResponseMessage response = await HttpHelpers.InvokeHttpTrigger(functionName, queryString);
            string actualMessage = await response.Content.ReadAsStringAsync();

            Assert.Equal(expectedStatusCode, response.StatusCode);
            
            if (!string.IsNullOrEmpty(expectedMessage)) {
                Assert.False(string.IsNullOrEmpty(actualMessage));
                Assert.Contains(expectedMessage, actualMessage);
            }
        }

        [Theory]
        [InlineData("HttpTriggerESModules", "?name=Test", HttpStatusCode.OK, "Hello Test")]
        [InlineData("HttpTriggerESModules", "?name=Marie&lastName=Hoeger", HttpStatusCode.OK, "Hello Marie")]
        [InlineData("HttpTriggerESModules", "", HttpStatusCode.BadRequest, "Please pass a name on the query string or in the request body")]
        public async Task HttpTriggerESModuleTests(string functionName, string queryString, HttpStatusCode expectedStatusCode, string expectedMessage)
        {
            // TODO: Verify exception on 500 after https://github.com/Azure/azure-functions-host/issues/3589
            HttpResponseMessage response = await HttpHelpers.InvokeHttpTrigger(functionName, queryString);
            string actualMessage = await response.Content.ReadAsStringAsync();

            var nodeVersion = Environment.GetEnvironmentVariable("nodeVersion");
            if (nodeVersion.Equals("14.x")) {
                Assert.Equal(expectedStatusCode, response.StatusCode);
                
                if (!string.IsNullOrEmpty(expectedMessage)) {
                    Assert.False(string.IsNullOrEmpty(actualMessage));
                    Assert.Contains(expectedMessage, actualMessage);
                }
            } else {
                // This function will fail to load on the worker side
                Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
            }
        }

        [Theory]
        [InlineData("HttpTriggerBodyAndRawBody", "{\"a\":1}", "application/json", HttpStatusCode.OK)]
        [InlineData("HttpTriggerBodyAndRawBody", "{\"a\":1, \"b\":}", "application/json", HttpStatusCode.OK)]
        [InlineData("HttpTriggerBodyAndRawBody", "{\"a\":1}", "application/octet-stream", HttpStatusCode.OK)]
        [InlineData("HttpTriggerBodyAndRawBody", "abc", "text/plain", HttpStatusCode.OK)]

        public async Task HttpTriggerTestsWithCustomMediaType(string functionName, string body, string mediaType, HttpStatusCode expectedStatusCode)
        {
            HttpResponseMessage response = await HttpHelpers.InvokeHttpTriggerWithBody(functionName, body, expectedStatusCode, mediaType);
            JObject responseBody = JObject.Parse(await response.Content.ReadAsStringAsync());

            Assert.Equal(expectedStatusCode, response.StatusCode);
            VerifyBodyAndRawBody(responseBody, body, mediaType);
        }

        [Fact]
        public async Task HttpTriggerWithCookieTests()
        {
            HttpResponseMessage response = await HttpHelpers.InvokeHttpTrigger("HttpTriggerSetsCookie");            
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            List<string> cookies = response.Headers.SingleOrDefault(header => header.Key == "Set-Cookie").Value.ToList();
            Assert.Equal(5, cookies.Count);
            Assert.Equal("mycookie=myvalue; max-age=200000; path=/", cookies[0]);
            Assert.Equal("mycookie2=myvalue; max-age=200000; path=/", cookies[1]);
            Assert.Equal("mycookie3-expires=myvalue3-expires; max-age=0; path=/", cookies[2]);
            Assert.Equal("mycookie4-samesite-lax=myvalue; path=/; samesite=lax", cookies[3]);
            Assert.Equal("mycookie5-samesite-strict=myvalue; path=/; samesite=strict", cookies[4]);
            // Assert.Equal("mycookie4-samesite-none=myvalue; path=/; samesite=none", cookies[5]);
        }

        [Fact]
        public async Task HttpTriggerBindingDataTests()
        {
            HttpResponseMessage response = await HttpHelpers.InvokeHttpTrigger("HttpTriggerBindingData", "?stringInput=hello&emptyStringInput=");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            string responseBody = await response.Content.ReadAsStringAsync();
            Assert.Equal("binding data exists", responseBody);
        }

        private static void VerifyBodyAndRawBody(JObject result, string input, string mediaType)
        {
            if (mediaType.Equals("application/json", StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    Assert.Equal(input, (string)result["reqRawBody"]);
                    Assert.True(JToken.DeepEquals((JObject)result["reqBody"], JObject.Parse(input)));
                }
                catch (InvalidCastException)   // Invalid JSON
                {
                    Assert.Equal(input, (string)result["reqRawBody"]);
                    Assert.Equal(input, (string)result["reqBody"]);
                }
            }
            else if (IsMediaTypeOctetOrMultipart(mediaType))
            {
                JObject reqBody = (JObject)result["reqBody"];
                byte[] responseBytes = reqBody["data"].ToObject<byte[]>();
                Assert.True(responseBytes.SequenceEqual(Encoding.UTF8.GetBytes(input)));
                Assert.Equal(input, (string)result["reqRawBody"]);
            }
            else if (mediaType.Equals("text/plain", StringComparison.OrdinalIgnoreCase))
            {
                Assert.Equal(input, (string)result["reqRawBody"]);
                Assert.Equal(input, (string)result["reqBody"]);
            } else {
                Assert.Equal("Supported media types are 'text/plain' 'application/octet-stream', 'multipart/*', and 'application/json'", $"Found mediaType '{mediaType}'");
            }
        }

        private static bool IsMediaTypeOctetOrMultipart(string mediaType)
        {
            return mediaType != null && (string.Equals(mediaType, "application/octet-stream", StringComparison.OrdinalIgnoreCase)
                || mediaType.IndexOf("multipart/", StringComparison.OrdinalIgnoreCase) >= 0);
        }
    }
}