module.exports = async function (context, eventHubMessage) {
    context.log(`JavaScript eventhub trigger function called for message ${eventHubMessage}`);
    return eventHubMessage;
};