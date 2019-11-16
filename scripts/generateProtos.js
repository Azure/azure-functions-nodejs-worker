const util = require("util");

const exec = util.promisify(require("child_process").exec);
const readdirp = util.promisify(require("readdirp"));

const protoRoot = "azure-functions-language-worker-protobuf/src/proto";
const masterProto = "azure-functions-language-worker-protobuf/src/proto/FunctionRpc.proto";

const jsOut = "azure-functions-language-worker-protobuf/src/rpc.js";
const jsStaticOut = "azure-functions-language-worker-protobuf/src/rpc_static.js";
const dTsOut = "azure-functions-language-worker-protobuf/src/rpc.d.ts";

async function generateProtos() {
    const shared = await getFiles(`./${protoRoot}/shared`, "*.proto");
    const deps = await getFiles(`./${protoRoot}`, "!FunctionRpc*", "!*shared");

    const allFiles = `${shared} ${deps} ${masterProto}`;

    console.log("Compiling protobuf definitions..");
    genJs(allFiles)
        .then(data => console.log("Compiled to JavaScript."))
        .catch(err => console.log(`Could not compile to JavaScript: ${err}`));
    
    // Don't generate with Node.js v12 until resolved: https://github.com/protobufjs/protobuf.js/issues/1275
    if (!process.version.startsWith("v12")) {
        genTs(allFiles)
        .then(data => console.log("Compiled to TypeScript."))
        .catch(err => console.log(`Could not compile to TypeScript: ${err}`));
    }
};

async function getFiles(root, fileFilter, directoryFilter) {
    return readdirp({ root, fileFilter, directoryFilter })
        .then(data => getDelimitedFiles(data));
}

function getDelimitedFiles(entryInfo) {
    return entryInfo.files.map(entry => entry.fullPath).reduce((acc, curr) => `${acc} ${curr}`);
}

function genJs(files) {
    return exec(`pbjs -t json-module -w commonjs -o ${jsOut} ${files}`);
}

function genTs(files) {
    return exec(`pbjs -t static-module -o ${jsStaticOut} ${files}`)
        .then(exec(`pbts -o ${dTsOut} ${jsStaticOut}`));
}

generateProtos();
