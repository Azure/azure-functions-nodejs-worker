# Storage-First Metrics Pipeline — Local Demo

This demo shows the metrics pipeline running locally with **Azurite** (storage emulator)
so you can see user logs routed to Blob Storage instead of App Insights.

## Prerequisites

| Tool | Install |
|------|---------|
| Node.js ≥ 16 | https://nodejs.org |
| Azure Functions Core Tools v4 | `npm i -g azure-functions-core-tools@4 --unsafe-perm true` |
| Azurite (local storage emulator) | `npm i -g azurite` |

## Quick Start

### 1. Start Azurite (in a separate terminal)

```bash
azurite --silent --location ./azurite-data --debug azurite-debug.log
```

This gives you a local Blob Storage endpoint at `http://127.0.0.1:10000`.

### 2. Build the worker

```bash
# From the repo root
cd ..
npm run build
```

### 3. Install demo dependencies

```bash
cd demo
npm install
```

### 4. Start the Function App

```bash
npm start
```

### 5. Trigger the sample function

```bash
# HTTP trigger — generates log entries
curl http://localhost:7071/api/PipelineDemo

# Or with query param to simulate errors
curl "http://localhost:7071/api/PipelineDemo?fail=true"
```

### 6. Inspect Blob Storage

```bash
# List blobs in the function-logs container
node scripts/inspectBlobs.js
```

Or use **Azure Storage Explorer** → connect to `http://127.0.0.1:10000`
with the Azurite default key.

## What to Observe

| Signal | Where it goes | How to verify |
|--------|---------------|---------------|
| System logs | gRPC event stream → terminal console | Watch terminal output |
| User logs (`context.log(...)`) | Blob Storage only | Run `inspectBlobs.js` or check `function-logs` container |
| Lightweight metrics (~150 bytes) | App Insights (not configured in demo) | Check `metricsEmitter` logs |

### Expected Behavior

1. **With pipeline enabled** (default in this demo):
   - `context.log("Hello")` → buffered in memory → written to Blob as gzipped JSON on invocation completion
   - System logs still appear in the terminal
   - No user logs in the terminal output (suppressed from event stream)

2. **With pipeline disabled** (set `AZURE_FUNCTIONS_METRICS_PIPELINE_ENABLED=false`):
   - All logs appear in the terminal as usual
   - No blobs written

## Environment Variables

All pipeline settings (`local.settings.json`):

| Variable | Value | Purpose |
|----------|-------|---------|
| `AZURE_FUNCTIONS_METRICS_PIPELINE_ENABLED` | `true` | Activates the pipeline |
| `AZURE_FUNCTIONS_METRICS_PIPELINE_BLOB_CONNECTION_STRING` | Azurite conn string | Points to local storage |
| `AZURE_FUNCTIONS_METRICS_PIPELINE_BLOB_CONTAINER` | `function-logs` | Container name for raw logs |
| `AZURE_FUNCTIONS_METRICS_PIPELINE_COMPRESS_LOGS` | `false` | Disabled for easy inspection (set `true` in prod) |
| `AZURE_FUNCTIONS_METRICS_PIPELINE_MAX_LOGS_PER_INVOCATION` | `10000` | Max buffered logs per invocation |

## File Structure

```
demo/
├── README.md                      ← You are here
├── package.json                   ← Function app manifest
├── host.json                      ← Host configuration
├── local.settings.json            ← Pipeline env vars (Azurite)
├── scripts/
│   └── inspectBlobs.js            ← Reads blobs from Azurite
└── src/
    └── functions/
        └── PipelineDemo.js        ← Sample HTTP trigger
```
