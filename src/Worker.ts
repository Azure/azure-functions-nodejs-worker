import * as parseArgs from 'minimist';
import * as semver from 'semver';

import { FunctionRpc as rpc } from '../protos/rpc';
import Status = rpc.StatusResult.Status;
import { CreateGrpcEventStream } from './GrpcService';
import { WorkerChannel } from './WorkerChannel';
import { FunctionLoader } from './FunctionLoader';

export function startNodeWorker(args) {
  let { host, port, workerId, requestId } = parseArgs(args.slice(2));
  if (!host || !port || !workerId || !requestId) {
    console.log('usage --host hostName --port portNumber --workerId workerId --requestId requestId');
    throw new Error('Connection info missing');
  }

  if (!semver.satisfies(process.version, '>=8.4.0')) {
    console.error(`azure-functions-nodejs-worker officially supports node version >=8.4.0. Current version ${process.version}.
To install required native modules for ${process.version}, install node-pre-gyp via 'npm i -g node-pre-gyp'.
Navigate to '<node-worker-dir>/grpc' and run 'node-pre-gyp install'`);
  }

  let connection = `${host}:${port}`;
  console.log(`Worker ${workerId} connecting on ${connection}`);
  let eventStream = CreateGrpcEventStream(connection);

  let workerChannel = new WorkerChannel(workerId, eventStream, new FunctionLoader());

  eventStream.write({
    requestId: requestId,
    startStream: {
      workerId: workerId
    }
  });

  process.on('uncaughtException', err => {
    console.error(`Worker ${workerId} uncaught exception: `, err);
    process.exit(1);
  });
  process.on('exit', code => {
    console.log(`Worker ${workerId} exited with code ${code}`);
  });
}

