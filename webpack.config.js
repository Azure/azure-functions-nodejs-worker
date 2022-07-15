module.exports = {
    entry: "./dist/src/main.js",
    output: {
        path: `${__dirname}/dist/src`,
        filename: "main-bundle.js",
        libraryTarget: "commonjs2"
    },
    target: 'node',
    node: {
        __dirname: false
    },
    externals: {
        '@azure/functions-core': 'commonjs2 @azure/functions-core'
    },
    module: {
        parser: {
            javascript: {
                commonjsMagicComments: true
            }
        }
    },
    plugins: []
};