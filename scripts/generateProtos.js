const util = require('util');
const exec = util.promisify(require('child_process').exec);
const path = require('path');

async function generateProtos() {
    try {
        const protoSrc = path.join(__dirname, '..', 'azure-functions-language-worker-protobuf', 'src');
        const protoRoot = path.join(protoSrc, 'proto');

        const protoFiles = [
            path.join(protoRoot, 'shared', 'NullableTypes.proto'),
            path.join(protoRoot, 'identity', 'ClaimsIdentityRpc.proto'),
            path.join(protoRoot, 'FunctionRpc.proto'),
        ].join(' ');

        console.log('Compiling protobuf definitions...');

        console.log('Compiling to JavaScript...');
        const jsOut = path.join(protoSrc, 'rpc.js');
        await run(`pbjs -t json-module -w commonjs -o ${jsOut} ${protoFiles}`);
        console.log(`Compiled to JavaScript: "${jsOut}"`);

        console.log('Compiling to JavaScript static module...');
        const jsStaticOut = path.join(protoSrc, 'rpc_static.js');
        await run(`pbjs -t static-module -o ${jsStaticOut} ${protoFiles}`);
        console.log(`Compiled to JavaScript static module: "${jsStaticOut}"`);

        console.log('Compiling to TypeScript...');
        const dTsOut = path.join(protoSrc, 'rpc.d.ts');
        await run(`pbts -o ${dTsOut} ${jsStaticOut}`);
        console.log(`Compiled to TypeScript: "${dTsOut}"`);
    } catch (error) {
        console.error('Failed to compile protobuf definitions:');
        console.error(error.message);
        process.exit(-1);
    }
}

async function run(command) {
    const { stdout, stderr } = await exec(command);
    console.log(stdout);
    console.error(stderr);
}

generateProtos();
