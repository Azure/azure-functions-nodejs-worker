module.exports = async function (context, eventHubMessages) {
    context.log(`JavaScript eventhub trigger function called for string message array ${eventHubMessages}`);
    
    eventHubMessages.forEach((message, index) => {
        context.log(`Processed message ${message}`);
    });

    return eventHubMessages[0];
};