param(
    [int]$Port = 7075,
    [switch]$Streaming
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$executable = Join-Path $root 'target\debug\azure-functions-nodejs-worker-rust.exe'
if (-not (Test-Path -LiteralPath $executable)) {
    throw 'Build the Rust worker with cargo build before starting the sample.'
}
$settings = @{
    FUNCTIONS_WORKER_RUNTIME = 'node'
    FUNCTIONS_RUST_WORKER_CONFIG = (Join-Path $root 'runtime.json')
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
    & func start --script-root (Join-Path $root 'sample') --port $Port
    if ($LASTEXITCODE -ne 0) { throw "Functions host exited with code $LASTEXITCODE" }
}
finally {
    foreach ($key in $previous.Keys) {
        [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process')
    }
}
