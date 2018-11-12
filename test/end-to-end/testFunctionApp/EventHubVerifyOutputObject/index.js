module.exports = async function (context, eventHubMessage) {
    context.log(`JavaScript EventHubVerifyOutputObject function called for message ${JSON.stringify(eventHubMessage)}`);
    return eventHubMessage;
};