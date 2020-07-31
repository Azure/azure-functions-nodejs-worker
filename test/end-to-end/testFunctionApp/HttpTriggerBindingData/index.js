module.exports = async function (context) {
    context.log('JavaScript HTTP trigger function processed a request.');
    const { methodName, utcNow, randGuid } = context.bindingData.sys;
    const { invocationId, query, headers } = context.bindingData;
    const bindingDataExists = exists(methodName) && exists(utcNow) && exists(randGuid) && exists(invocationId) && exists(query) && exists(headers);
    if (bindingDataExists) {
        context.res.body = "binding data exists"
    }
};

function exists(property) {
    return property !== null && property !== undefined;
}