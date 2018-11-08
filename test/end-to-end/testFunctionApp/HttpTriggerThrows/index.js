module.exports = async function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request.');

    throw new Error("Test Exception");
};