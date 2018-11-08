// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

using System;

namespace Azure.Functions.Java.Tests.E2E
{
    public static class Constants
    {
        public static string FunctionsHostUrl = "http://localhost:7071";
        public static string StorageConnectionStringSetting = Environment.GetEnvironmentVariable("AzureWebJobsStorage");

        //Queue tests
        public static string OutputBindingQueueName = "test-output-node";
        public static string InputBindingQueueName = "test-input-node";

        // CosmosDB tests
        public static string CosmosDBConnectionStringSetting = Environment.GetEnvironmentVariable("AzureWebJobsCosmosDBConnectionString");
        public static string DocDbDatabaseName = "ItemDb";
        public static string InputDocDbCollectionName = "ItemCollectionIn";
        public static string OutputDocDbCollectionName = "ItemCollectionOut";
        public static string DocDbLeaseCollectionName = "leases";

        // EventHubs
        public static string OutputEventHubQueueName = "test-output-object-node";
        public static string StringOutputEventHubQueueName = "test-output-string-node";
        public static string InputObjectEventHubName = "test-input-object-node";
        public static string InputStringEventHubName = "test-input-string-node";
        public static string EventHubsConnectionStringSetting = Environment.GetEnvironmentVariable("AzureWebJobsEventHubSender");
    }
}