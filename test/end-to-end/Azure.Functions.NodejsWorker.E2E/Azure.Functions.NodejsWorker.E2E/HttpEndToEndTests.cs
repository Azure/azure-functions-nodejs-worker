// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

using System;
using System.Collections.Generic;
using System.Net;
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
            Assert.True(await Utilities.InvokeHttpTrigger(functionName, queryString, null, expectedStatusCode, expectedMessage));
        }
    }

    [Collection(Constants.EasyAuthCollectionName)]
    public class HttpEndToEndTests_Auth
    {
        private readonly EasyAuthFixture _fixture;

        public HttpEndToEndTests_Auth(EasyAuthFixture fixture)
        {
            _fixture = fixture;
        }

        [Fact]
        public async Task HttpTrigger_Identities_Succeeds()
        {
            var headers = new Dictionary<string, string>
            {
                { "x-ms-client-principal", MockEasyAuth("facebook", "Connor McMahon", "10241897674253170") },
            };

            Assert.True(await Utilities.InvokeHttpTrigger("HttpTriggerIdentities", "", headers, HttpStatusCode.OK, "facebook, Connor McMahon, 10241897674253170"));
        }

        private string MockEasyAuth(string provider, string name, string id)
        {
            {
                string userIdentityJson = @"{
  ""auth_typ"": """ + provider + @""",
  ""claims"": [
    {
      ""typ"": ""http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"",
      ""val"": """ + name + @"""
    },
    {
      ""typ"": ""http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn"",
      ""val"": """ + name + @"""
    },
    {
      ""typ"": ""http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"",
      ""val"": """ + id + @"""
    }
  ],
  ""name_typ"": ""http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"",
  ""role_typ"": ""http://schemas.microsoft.com/ws/2008/06/identity/claims/role""
}";
                string easyAuthHeaderValue = Convert.ToBase64String(Encoding.UTF8.GetBytes(userIdentityJson));
                return easyAuthHeaderValue;
            }
        }
    }
}