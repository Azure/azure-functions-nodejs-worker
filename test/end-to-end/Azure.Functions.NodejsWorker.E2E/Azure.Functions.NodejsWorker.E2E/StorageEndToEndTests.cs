// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

using System;
using System.Threading.Tasks;
using Xunit;

namespace Azure.Functions.NodeJs.Tests.E2E
{
    [Collection(Constants.FunctionAppCollectionName)]
    public class StorageEndToEndTests 
    {
        private FunctionAppFixture _fixture;

        public StorageEndToEndTests(FunctionAppFixture fixture)
        {
            _fixture = fixture;
        }

        [Fact]
        public async Task QueueTriggerAndOutput_Succeeds()
        {
            string expectedQueueMessage = Guid.NewGuid().ToString();
            //Clear queue
            await StorageHelpers.ClearQueue(Constants.Queue.OutputBindingName);
            await StorageHelpers.ClearQueue(Constants.Queue.InputBindingName);

            //Set up and trigger            
            await StorageHelpers.CreateQueue(Constants.Queue.OutputBindingName);
            await StorageHelpers.InsertIntoQueue(Constants.Queue.InputBindingName, expectedQueueMessage);
            
            //Verify
            var queueMessage = await StorageHelpers.ReadFromQueue(Constants.Queue.OutputBindingName);
            Assert.Equal(expectedQueueMessage, queueMessage);
        }

        [Fact]
        public async Task TimerTriggerRunsOnStartup()
        {
            var queueMessage = await StorageHelpers.ReadFromQueue(Constants.Queue.TimerOutputBindingName);
            Assert.True(String.Equal(queueMessage, "true") || String.Equal(queueMessage, "false"));
        }
    }
}