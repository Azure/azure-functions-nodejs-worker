# Implement protocol-aware gRPC credentials

- Task ID: `protocol-aware-grpc-transport`
- Round: 1
- Branch: worker/task-1
- Dependencies: (none)

## Description

Update `src/Worker.ts` and `src/GrpcClient.ts` so the worker keeps the full `--functions-uri`/`URL` instead of discarding its scheme, derives the gRPC target from `url.host`, uses `grpc.credentials.createInsecure()` for `http:` and `grpc.credentials.createSsl()` for `https:`, and throws a clear `AzFuncSystemError` for unsupported schemes. Preserve current `http://127.0.0.1` compatibility on v3.x; do not force TLS unconditionally. Add short code comments/logging that capture the localhost/trusted-host historical assumption and why the compatibility fallback remains.