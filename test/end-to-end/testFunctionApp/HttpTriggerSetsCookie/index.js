module.exports = async function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request.');
    // TODO: Add this scenario
    // {
    //     name: "mycookie6-samesite-none",
    //     value: "myvalue",
    //     sameSite: "None"
    // },
    context.res = {
        status: 200,
        cookies: [
            {
                name: "mycookie",
                value: "myvalue",
                maxAge: 200000
            },
            {
                name: "mycookie2",
                value: "myvalue",
                path: "/",
                maxAge: "200000"
            },
            {
                name: "mycookie3-expires",
                value: "myvalue3-expires",
                maxAge: 0
            },
            {
                name: "mycookie4-samesite-lax",
                value: "myvalue",
                sameSite: "Lax"
            },
            {
                name: "mycookie5-samesite-strict",
                value: "myvalue",
                sameSite: "Strict"
            }
        ]
    }
};