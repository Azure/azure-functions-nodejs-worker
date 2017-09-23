var nodeAbi = require('node-abi');

var abi = nodeAbi.getAbi(process.version, 'node');

console.log(`node-v${abi}-${process.platform}-${process.arch}`);