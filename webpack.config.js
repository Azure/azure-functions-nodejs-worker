module.exports = {
    entry: './dist/src/Worker.js',
    output: {
        path: `${__dirname}/dist/src`,
        filename: 'worker-bundle.js',
        library: 'worker',
        libraryTarget: 'commonjs2',
    },
    resolve: {
        alias: {
            '@protobufjs/inquire': `${__dirname}/scripts/webpack-protobufjs-inquire.js`,
        },
    },
    target: 'node',
    node: {
        __dirname: false,
    },
    externals: {
        '@azure/functions-core': 'commonjs2 @azure/functions-core',
    },
    module: {
        parser: {
            javascript: {
                commonjsMagicComments: true,
            },
        },
    },
    plugins: [],
};
