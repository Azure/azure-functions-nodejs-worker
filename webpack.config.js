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
        path: `${__dirname}/pkg`,
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
        loaders: [
            {
                // supply modified grpc package.json location
                test: /.*grpc_extension.js$/,
                loader: StringReplacePlugin.replace({
                    replacements: [
                        dynamicRequire,
                        {
                            pattern: /(\.\.\/)*package.json/,
                            replacement: function (match, p1, offset, string) {
                                return "./grpc/package.json";
                            }
                        }
                    ]
                })
            },
            {
                // supply modified root.pem location
                test: /.*grpc.*index.js$/,
                loader: StringReplacePlugin.replace({
                    replacements: [
                        {
                            pattern: /'\.\.', '\.\.'/,
                            replacement: function (match, p1, offset, string) {
                                return `'grpc'`;
                            }
                        }
                    ]
                })
            },
            {
                // use dynamic require for require(expression)
                // versioning.js -> require(env variable)
                // pre-binding.js -> require(package_json_path)
                // FunctionLoader.js -> require(userFunction)
                test: /.*(versioning.js|pre-binding.js|FunctionLoader.js)$/,
                loader: StringReplacePlugin.replace({
                    replacements: [ dynamicRequire ]
                })
            }
        ]
    },
    plugins: [
        new StringReplacePlugin()
    ]
};