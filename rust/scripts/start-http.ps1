param(
    [ValidateSet('hello-world', 'hello-world-configured', 'otel-sample')]
    [string]$Sample = 'hello-world',
    [int]$Port = 7075,
    [switch]$Streaming,
    # Shows worker console output, including the [Rust worker] startup lines.
    [switch]$VerboseHost
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$executable = Join-Path $root 'target\debug\azure-functions-nodejs-worker-rust.exe'
if (-not (Test-Path -LiteralPath $executable)) {
    throw 'Build the Rust worker with cargo build before starting the sample.'
}
$sampleRoot = Join-Path $root "sample\$Sample"
if (-not (Test-Path -LiteralPath (Join-Path $sampleRoot 'node_modules\@azure\functions'))) {
    throw "Run npm install in $sampleRoot first."
}
# TypeScript samples compile to dist before the host loads them.
npm --prefix $sampleRoot run build --if-present
if ($LASTEXITCODE -ne 0) { throw "Build failed for $sampleRoot" }
# A sample can ship its own worker config (customer opt-in); otherwise use the worker defaults.
$config = Join-Path $sampleRoot 'rust-worker.json'
if (-not (Test-Path -LiteralPath $config)) {
    $config = Join-Path $root 'runtime.json'
}
$settings = @{
    FUNCTIONS_WORKER_RUNTIME = 'node'
    FUNCTIONS_RUST_WORKER_CONFIG = $config
    languageWorkers__node__workerDirectory = $root
    languageWorkers__node__defaultExecutablePath = $executable
    languageWorkers__node__arguments = $null
    AzureWebJobsStorage = ''
    AzureWebJobsSecretStorageType = 'files'
    RUST_SAMPLE_HTTP_STREAMING = $Streaming.IsPresent.ToString().ToLowerInvariant()
}
$previous = @{}
try {
    foreach ($key in $settings.Keys) {
        $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        [Environment]::SetEnvironmentVariable($key, $settings[$key], 'Process')
    }
    Write-Host "Starting sample '$Sample' on port $Port with worker config $config"
    $funcArgs = @('start', '--script-root', $sampleRoot, '--port', $Port)
    if ($VerboseHost) { $funcArgs += '--verbose' }
    & func @funcArgs
    if ($LASTEXITCODE -ne 0) { throw "Functions host exited with code $LASTEXITCODE" }
}
finally {
    foreach ($key in $previous.Keys) {
        [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process')
    }
}
