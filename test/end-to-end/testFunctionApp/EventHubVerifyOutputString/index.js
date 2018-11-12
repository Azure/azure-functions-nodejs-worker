module.exports = async function (context, eventHubMessage) {
    context.log(`JavaScript EventHubVerifyStringObject function called for message ${eventHubMessage}`);
    return eventHubMessage;
};