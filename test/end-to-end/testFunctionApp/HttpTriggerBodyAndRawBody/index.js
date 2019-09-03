module.exports = async function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request.');
	context.res.body = {
            reqBody: context.req.body,
            reqRawBody: context.req.rawBody,
        };
};