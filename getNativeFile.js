var nodeAbi;
try {
  nodeAbi = require('./lib/node_modules/node-abi');
}
catch (e) {
  nodeAbi = require('./node_modules/node-abi');
}

var abi = nodeAbi.getAbi(process.version, 'node');

console.log(`node-v${abi}-${process.platform}-${process.arch}`);