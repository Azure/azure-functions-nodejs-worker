module.exports = async function (context) {
    context.log('JavaScript HTTP trigger function processed a request.');
    const { methodName, utcNow, randGuid } = context.bindingData.sys;
    const { invocationId, query, headers } = context.bindingData;
    const bindingDataExists = 
        exists(methodName) 
        && exists(utcNow)
        && exists(randGuid)
        && exists(invocationId)
        && exists(query)
        && exists(headers)
        && exists(query.stringInput)
        && exists(query.emptyStringInput); // should be ""
    if (bindingDataExists) {
        context.res.body = "binding data exists"
    } else {
        context.res = {
            status: 500
        }
    }
};

function exists(property) {
    return property !== null && property !== undefined;
}