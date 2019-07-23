// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

using System;
using System.Diagnostics;
using System.Threading.Tasks;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using Newtonsoft.Json.Linq;
using System.Text;
using System.Linq;

namespace Azure.Functions.NodeJs.Tests.E2E
{
    public static class Utilities
    {
        public static async Task RetryAsync(Func<Task<bool>> condition, int timeout = 60 * 1000, int pollingInterval = 2 * 1000, bool throwWhenDebugging = false, Func<string> userMessageCallback = null)
        {
            DateTime start = DateTime.Now;
            while (!await condition())
            {
                await Task.Delay(pollingInterval);

                bool shouldThrow = !Debugger.IsAttached || (Debugger.IsAttached && throwWhenDebugging);
                if (shouldThrow && (DateTime.Now - start).TotalMilliseconds > timeout)
                {
                    string error = "Condition not reached within timeout.";
                    if (userMessageCallback != null)
                    {
                        error += " " + userMessageCallback();
                    }
                    throw new ApplicationException(error);
                }
            }
        }

        public static async Task<bool> InvokeHttpTrigger(string functionName, string queryString, HttpStatusCode expectedStatusCode, string expectedMessage, int expectedCode = 0)
        {
            string uri = $"api/{functionName}{queryString}";
            HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Get, uri);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/plain"));

            var httpClient = new HttpClient();
            httpClient.BaseAddress = new Uri(Constants.FunctionsHostUrl);
            var response = await httpClient.SendAsync(request);
            if (expectedStatusCode != response.StatusCode && expectedCode != (int)response.StatusCode)
            {
                return false;
            }

            if (!string.IsNullOrEmpty(expectedMessage))
            {
                string actualMessage = await response.Content.ReadAsStringAsync();
                return actualMessage.Contains(expectedMessage);
            }
            return true;
        }

        public static async Task<bool> InvokeHttpTriggerWithBody(string functionName, string body, HttpStatusCode expectedStatusCode, string mediaType, int expectedCode = 0)
        {
            // Arrange
            HttpRequestMessage request = new HttpRequestMessage
            {
                RequestUri = new Uri($"{Constants.FunctionsHostUrl}/api/{functionName}"),
                Method = HttpMethod.Post,
                Content = new StringContent(body),
            };
            request.Content.Headers.ContentType = new MediaTypeHeaderValue(mediaType);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue(mediaType));

            // Act
            HttpResponseMessage response = null;
            using (var httpClient = new HttpClient())
            {
                response = await httpClient.SendAsync(request);
            }

            // Verify
            if (expectedStatusCode != response.StatusCode && expectedCode != (int)response.StatusCode)
            {
                return false;
            }

            return VerifyBodyAndRawBody(JObject.Parse(await response.Content.ReadAsStringAsync()), body, mediaType);
        }

        private static bool VerifyBodyAndRawBody(JObject result, string input, string mediaType)
        {
            if (mediaType.Equals("application/json", StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    return ((string)result["reqRawBody"]).Equals(input) && (JToken.DeepEquals((JObject)result["reqBody"], JObject.Parse(input)));
                }
                catch (InvalidCastException)   // Invalid JSON
                {
                    return ((string)result["reqRawBody"]).Equals(input) && ((string)result["reqBody"]).Equals(input);
                }
            }
            else if(IsMediaTypeOctetOrMultipart(mediaType))
            {
                JObject reqBody = (JObject)result["reqBody"];
                byte[] responseBytes = reqBody["data"].ToObject<byte[]>();
                return responseBytes.SequenceEqual(Encoding.UTF8.GetBytes(input)) && ((string)result["reqRawBody"]).Equals(input);
            }
            else if(mediaType.Equals("text/plain", StringComparison.OrdinalIgnoreCase))
            {
                return ((string)result["reqRawBody"]).Equals(input) && ((string)result["reqBody"]).Equals(input);
            }

            return false;
        }

        private static bool IsMediaTypeOctetOrMultipart(string mediaType)
        {
            return mediaType != null && (string.Equals(mediaType, "application/octet-stream", StringComparison.OrdinalIgnoreCase) ||
                            mediaType.IndexOf("multipart/", StringComparison.OrdinalIgnoreCase) >= 0);
        }
    }
}