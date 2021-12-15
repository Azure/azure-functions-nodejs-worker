var StringReplacePlugin = require("string-replace-webpack-plugin");

// replace require(expression) with __non_webpack_require__(expression)
var dynamicRequire = {
    pattern: /require\(([a-zA-Z0-9_\.]+)\)/,
    replacement: function (match, p1, offset, string) {
        console.log(`dynamic require ${p1} in ${match}`);
        return `__non_webpack_require__(${p1})`;
    }
}

module.exports = {
    entry: "./dist/src/Worker.js",
    output: {
        path: `${__dirname}/dist/src`,
        filename: "worker-bundle.js",
        library: "worker",
        libraryTarget: "commonjs2"
    },
    target: 'node',
    node: {
        __dirname: false
    },
    externals: [
        'memcpy',
    ],
    module: {
        rules: [
            {
                // use dynamic require for require(expression)
                // FunctionLoader.js -> require(userFunction)
                test: /.*(FunctionLoader.js)$/,
                use: StringReplacePlugin.replace({
                    replacements: [ dynamicRequire ]
                })
            }
        ]
    },
    plugins: [
        new StringReplacePlugin()
    ]
};