import * as parseArgs from 'minimist';

import { FunctionRpc as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import Status = rpc.StatusResult.Status;
import { WorkerChannel } from './WorkerChannel';
import { FunctionLoader } from './FunctionLoader';
import { CreateGrpcEventStream } from './GrpcService';

export function startNodeWorker(args) {
  let { host, port, workerId, requestId, grpcMaxMessageLength } = parseArgs(args.slice(2));
  if (!host || !port || !workerId || !requestId || !grpcMaxMessageLength) {
    console.log('usage --host hostName --port portNumber --workerId workerId --requestId requestId --grpcMaxMessageLength grpcMaxMessageLength');
    throw new Error('Connection info missing');
  }

  let connection = `${host}:${port}`;
  console.log(`Worker ${workerId} connecting on ${connection}`);
  let eventStream = CreateGrpcEventStream(connection, parseInt(grpcMaxMessageLength));

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

