// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

using System;
using System.Threading.Tasks;
using Xunit;

namespace Azure.Functions.NodeJs.Tests.E2E
{
    public class StorageEndToEndTests 
    {
        [Fact]
        public async Task QueueTriggerAndOutput_Succeeds()
        {
            string expectedQueueMessage = Guid.NewGuid().ToString();
            //Clear queue
            await StorageHelpers.ClearQueue(Constants.OutputBindingQueueName);
            await StorageHelpers.ClearQueue(Constants.InputBindingQueueName);

            //Set up and trigger            
            await StorageHelpers.CreateQueue(Constants.OutputBindingQueueName);
            await StorageHelpers.InsertIntoQueue(Constants.InputBindingQueueName, expectedQueueMessage);
            
            //Verify
            var queueMessage = await StorageHelpers.ReadFromQueue(Constants.OutputBindingQueueName);
            Assert.Equal(expectedQueueMessage, queueMessage);
        }
    }
}