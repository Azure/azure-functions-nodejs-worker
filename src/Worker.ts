import * as parseArgs from 'minimist';

import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import Status = rpc.StatusResult.Status;
import { WorkerChannel } from './WorkerChannel';
import { FunctionLoader } from './FunctionLoader';
import { CreateGrpcEventStream } from './GrpcService';
import { systemLog, systemError } from './utils/Logger';

export function startNodeWorker(args) {
  let { host, port, workerId, requestId, grpcMaxMessageLength } = parseArgs(args.slice(2));
  if (!host || !port || !workerId || !requestId || !grpcMaxMessageLength) {
    systemLog('usage --host hostName --port portNumber --workerId workerId --requestId requestId --grpcMaxMessageLength grpcMaxMessageLength');
    // Find which arguments are in error
    var debugInfo: string[] = [];
    if (!host) debugInfo.push(`\'hostName\' is ${host}`);
    if (!port) debugInfo.push(`\'port\' is ${port}`);
    if (!workerId) debugInfo.push(`\'workerId\' is ${workerId}`);
    if (!requestId) debugInfo.push(`\'requestId\' is ${requestId}`);
    if (!grpcMaxMessageLength) debugInfo.push(`\'grpcMaxMessageLength\' is ${grpcMaxMessageLength}`);

    throw new Error(`gRPC client connection info is missing or incorrect (${debugInfo.join(", ")}).`);
  }

  let connection = `${host}:${port}`;
  systemLog(`Worker ${workerId} connecting on ${connection}`);
  let eventStream = CreateGrpcEventStream(connection, parseInt(grpcMaxMessageLength));

  let workerChannel = new WorkerChannel(workerId, eventStream, new FunctionLoader());

  eventStream.write({
    requestId: requestId,
    startStream: {
      workerId: workerId
    }
  });

  process.on('uncaughtException', err => {
    systemError(`Worker ${workerId} uncaught exception: `, err);
    process.exit(1);
  });
  process.on('exit', code => {
    systemLog(`Worker ${workerId} exited with code ${code}`);
  });
}

