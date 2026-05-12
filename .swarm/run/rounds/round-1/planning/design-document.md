_Revision note: `.swarm/run/rounds/round-1/planning/design-document.md` was not present in this workspace, so this revision is based on current repo state and upstream host contract inspection._

## Goal
Make the Node worker stop hard-coding plaintext gRPC and instead honor the scheme already provided in `--functions-uri`, without breaking the current v3.x host contract.

## Findings
- `src/Worker.ts` parses `--functions-uri` but drops the scheme via `new URL(uri).host`; `src/GrpcClient.ts` always calls `grpc.credentials.createInsecure()`.
- This was intentional in the original design, not a random missed API choice: the host currently starts the RPC server on loopback `http://127.0.0.1:<port>` and treats host↔worker gRPC as trusted local IPC (`WorkerConstants.HostName = "127.0.0.1"`, `HttpScheme = "http"`, and the host server comment says all clients are trusted).
- The fix is still necessary because the Node worker cannot currently participate in a secure rollout even though the existing contract already carries a URI with a scheme.

## Design
- Change the worker to pass the full `functions-uri` (or parsed `URL`) into `CreateGrpcEventStream`.
- Refactor `src/GrpcClient.ts` to derive:
  - target address from `url.host`
  - credentials from the URI scheme: `createInsecure()` for `http:` and `createSsl()` for `https:`
  - a clear failure for unsupported schemes
- Keep `http:` support on v3.x; do **not** unconditionally force TLS.
- Add concise comments/logging explaining that the `http:` fallback is a compatibility choice until the host advertises a secure endpoint.

## Compatibility / regression assessment
- No customer-facing contract change is required if we keep using the existing `functions-uri` argument; the worker simply stops ignoring its scheme.
- Unconditional TLS would be a breaking change against current hosts, so rollout must stay scheme-based and backward compatible.
- Full end-to-end plaintext removal still requires host-side changes because the current host listens on `http://127.0.0.1`.
- With scheme-based selection, expected regressions are low and limited to URI parsing/credential selection mistakes, which can be covered by unit tests.

## Test plan
- Baseline validation currently passes after setup: `npm ci`, `npm run build`, and `npm test` (132 passing, 8 pending).
- Add unit tests around URI parsing and credential selection using stubs for `@grpc/grpc-js`; cover current `http://127.0.0.1` behavior, `https:` selection, unsupported schemes, and worker startup regression checks.
- Re-run `npm run build` and `npm test` after implementation. Keep tests network-free so they remain stable across the CI Node version matrix.