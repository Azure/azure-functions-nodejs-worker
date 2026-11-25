# Copyright (c) .NET Foundation. All rights reserved.
# Licensed under the MIT License.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$rustRoot = Split-Path -Parent (Split-Path -Parent $root)
$cargo = Join-Path $env:USERPROFILE '.cargo\bin\cargo.exe'
if (-not (Test-Path -LiteralPath $cargo))
{
    throw 'Install Rust with rustup before building the Linux sidecar.'
}
$zigDirectory = & python -c 'import pathlib, ziglang; print(pathlib.Path(ziglang.__file__).parent)'
if ($LASTEXITCODE -ne 0)
{
    throw 'Missing Zig: install the Python ziglang package, or use a native Linux Rust build.'
}
$previousPath = $env:PATH
try
{
    $env:PATH = "$zigDirectory;$(Split-Path -Parent $cargo);$env:PATH"
    & $cargo zigbuild --manifest-path (Join-Path $rustRoot 'Cargo.toml') -p azure-functions-otel-exe `
        --release --locked --target x86_64-unknown-linux-musl
    if ($LASTEXITCODE -ne 0)
    {
        throw 'Linux build failed. Required tools: cargo-zigbuild, ziglang, and rustup target x86_64-unknown-linux-musl.'
    }
}
finally
{
    $env:PATH = $previousPath
}
Write-Host (Join-Path $rustRoot 'target\x86_64-unknown-linux-musl\release\azfunc-otel')
