import * as parseArgs from 'minimist';

import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import Status = rpc.StatusResult.Status;
import { WorkerChannel } from './WorkerChannel';
import { FunctionLoader } from './FunctionLoader';
import { CreateGrpcEventStream } from './GrpcService';
import { systemLog, systemError } from './utils/Logger';
import { InternalException } from './utils/InternalException';

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

    throw new InternalException(`gRPC client connection info is missing or incorrect (${debugInfo.join(", ")}).`);
  }

  let connection = `${host}:${port}`;
  systemLog(`Worker ${workerId} connecting on ${connection}`);
  
  let eventStream;
  try {
    eventStream = CreateGrpcEventStream(connection, parseInt(grpcMaxMessageLength));
  } catch (exception) {
    exception.message = "Error creating GRPC event stream: " + exception.message;
    throw new InternalException(exception);
  }

  let workerChannel = new WorkerChannel(workerId, eventStream, new FunctionLoader());

  eventStream.write({
    requestId: requestId,
    startStream: {
      workerId: workerId
    }
  });

  process.on('uncaughtException', err => {
    let errorMessage: string;
    if ((<InternalException>err).isAzureFunctionsInternalException) {
      errorMessage = `Worker ${workerId} uncaught exception: ${err.stack || err}`;
    } else {
      errorMessage = `Worker ${workerId} uncaught exception (learn more: https://go.microsoft.com/fwlink/?linkid=2097909 ): ${err.stack || err}`;
    }

    systemError(errorMessage);
    process.exit(1);
  });
  process.on('exit', code => {
    systemLog(`Worker ${workerId} exited with code ${code}`);
  });
}