module.exports = async function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request.');

    return {
        cookies: [
            {
                name: "mycookie",
                value: "myvalue",
                maxAge: 200000
            },
            {
                name: "mycookie2",
                value: "myvalue2",
                path: "/",
                maxAge: "200000"
            },
            {
                name: "mycookie3-expires",
                value: "myvalue3-expires",
                maxAge: 0
            }
        ],
        body: JSON.stringify(req.headers["cookie"])
    }
};