import * as parseArgs from 'minimist';

import { FunctionRpc as rpc } from '../protos/rpc';
import Status = rpc.StatusResult.Status;
import { WorkerChannel } from './WorkerChannel';
import { FunctionLoader } from './FunctionLoader';
import { CreateGrpcEventStream } from './GrpcService';

export function startNodeWorker(args) {
  let { host, port, workerId, requestId } = parseArgs(args.slice(2));
  if (!host || !port || !workerId || !requestId) {
    console.log('usage --host hostName --port portNumber --workerId workerId --requestId requestId');
    throw new Error('Connection info missing');
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

