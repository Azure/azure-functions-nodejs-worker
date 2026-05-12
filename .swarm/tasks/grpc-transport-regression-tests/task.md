# Add transport regression coverage

- Task ID: `grpc-transport-regression-tests`
- Round: 1
- Branch: worker/task-2
- Dependencies: protocol-aware-grpc-transport

## Description

Add targeted unit tests (for example a new `test/GrpcClient.test.ts` plus any minimal `test/Worker.test.ts` updates) that stub `@grpc/grpc-js` and verify: current `http://127.0.0.1:<port>` URIs still select insecure credentials, `https:` URIs select SSL credentials, unsupported schemes fail with a clear error, and worker startup/argument validation still behaves as before. Finish by running `npm run build` and `npm test`; keep the tests network-free so they stay stable across the CI Node 14/16/18/20/22/24 matrix.