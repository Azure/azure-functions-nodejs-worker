# Copyright (c) .NET Foundation. All rights reserved.
# Licensed under the MIT License.

<#
.SYNOPSIS
Builds the azfunc-otel sidecar and copies it into the npm package for the current platform.

.EXAMPLE
./scripts/build-otel-exe.ps1 -AzureMonitor
#>
param(
    [switch]$AzureMonitor,
    [switch]$DebugBuild
)

$ErrorActionPreference = 'Stop'
$rustRoot = Split-Path -Parent $PSScriptRoot
$cargo = (Get-Command cargo -ErrorAction SilentlyContinue)?.Source ?? (Join-Path $env:USERPROFILE '.cargo\bin\cargo.exe')

$arguments = @('build', '--manifest-path', (Join-Path $rustRoot 'Cargo.toml'), '-p', 'azure-functions-otel-exe')
if (-not $DebugBuild) { $arguments += '--release' }
if ($AzureMonitor) { $arguments += @('--features', 'azure-monitor') }
& $cargo @arguments
if ($LASTEXITCODE -ne 0) { throw "cargo build failed with exit code $LASTEXITCODE" }

$platform = if ($IsWindows -or $env:OS -eq 'Windows_NT') { 'win32' } elseif ($IsMacOS) { 'darwin' } else { 'linux' }
$arch = switch ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture) {
    'Arm64' { 'arm64' }
    default { 'x64' }
}
$exe = if ($platform -eq 'win32') { 'azfunc-otel.exe' } else { 'azfunc-otel' }
$profile = if ($DebugBuild) { 'debug' } else { 'release' }
$destination = Join-Path $rustRoot "opentelemetry-exe/npm/bin/$platform-$arch"
New-Item -ItemType Directory -Force $destination | Out-Null
Copy-Item (Join-Path $rustRoot "target/$profile/$exe") $destination -Force
Write-Host "Copied $exe to $destination"
