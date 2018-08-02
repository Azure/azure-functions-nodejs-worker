import { startNodeWorker } from '../src/Worker';
import { expect } from 'chai';
import 'mocha';

describe('Worker', () => {
  it('throws error on incorrect args: grpcMaxMessageLength 0', () => {
    var args = ["/node", "nodejsWorker.js", "--host", "120.0.0.0", "--port" ,"8000", "--workerId", "bd2e3e80-46ba", "--requestId", "bd2e3e80-46ba", "--grpcMaxMessageLength", "0"];
    expect(() => { startNodeWorker(args) }).to.throw("gRPC client connection info is missing or incorrect ('grpcMaxMessageLength' is 0).");
  });

  it('throws error on incorrect args: grpcMaxMessageLength 0 and null requestId', () => {
    var args = ["/node", "nodejsWorker.js", "--host", "120.0.0.0", "--port" ,"8000", "--workerId", "bd2e3e80-46ba", "--grpcMaxMessageLength", "0"];
    expect(() => { startNodeWorker(args) }).to.throw("gRPC client connection info is missing or incorrect ('requestId' is undefined, 'grpcMaxMessageLength' is 0).");
  });
})