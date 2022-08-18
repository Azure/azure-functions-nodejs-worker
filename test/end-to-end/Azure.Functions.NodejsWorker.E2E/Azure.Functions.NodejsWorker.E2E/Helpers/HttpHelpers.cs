// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;

namespace Azure.Functions.NodeJs.Tests.E2E
{
    class HttpHelpers
    {
        public static async Task<HttpResponseMessage> InvokeHttpTrigger(string functionName, string queryString = "")
        {
            // Basic http request
            HttpRequestMessage request = GetTestRequest(functionName, queryString);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/plain"));
            return await GetResponseMessage(request);
        }

        public static async Task<HttpResponseMessage> InvokeHttpTriggerWithBody(string functionName, string body, HttpStatusCode expectedStatusCode, Encoding encoding, string mediaType, int expectedCode = 0)
        {
            HttpRequestMessage request = GetTestRequest(functionName);
            if (encoding != null) {
                request.Content = new ByteArrayContent(encoding.GetPreamble().Concat(encoding.GetBytes(body)).ToArray());
            } else {
                request.Content = new StringContent(body);
            }
            request.Content.Headers.ContentType = new MediaTypeHeaderValue(mediaType);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue(mediaType));
            return await GetResponseMessage(request);
        }

        private static HttpRequestMessage GetTestRequest(string functionName, string queryString = "")
        {
            return new HttpRequestMessage
            {
                RequestUri = new Uri($"{Constants.FunctionsHostUrl}/api/{functionName}{queryString}"),
                Method = HttpMethod.Post
            };
        }

        private static async Task<HttpResponseMessage> GetResponseMessage(HttpRequestMessage request)
        {
            HttpResponseMessage response = null;
            using (var httpClient = new HttpClient())
            {
                response = await httpClient.SendAsync(request);
            }

            return response;
        }
    }
}