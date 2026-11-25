# Copyright (c) .NET Foundation. All rights reserved.
# Licensed under the MIT License.

param(
    [Parameter(Mandatory)]
    [string]$LinuxExe
)

$ErrorActionPreference = 'Stop'
$npm = if ($IsWindows) { 'npm.cmd' } else { 'npm' }
$root = Split-Path -Parent $PSScriptRoot
$rustRoot = Split-Path -Parent (Split-Path -Parent $root)
$exe = Get-Item -LiteralPath $LinuxExe
$stream = $exe.OpenRead()
try
{
    $header = [byte[]]::new(20)
    if ($stream.Read($header, 0, $header.Length) -ne 20 -or
        [BitConverter]::ToString($header[0..4]) -ne '7F-45-4C-46-02' -or
        $header[5] -ne 1 -or $header[18] -ne 62 -or $header[19] -ne 0)
    {
        throw 'LinuxExe must be a Linux x64 ELF executable, not the Windows exe.'
    }
}
finally
{
    $stream.Dispose()
}

$artifacts = Join-Path $root 'artifacts'
$stageRoot = Join-Path $artifacts ("stage-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null
$nativePackage = Join-Path $rustRoot 'opentelemetry-exe\npm'

foreach ($variant in @('with-customer-exe', 'without-otel', 'with-node-otel', 'probe'))
{
    $source = Join-Path $root $variant
    $stage = Join-Path $stageRoot $variant
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    Copy-Item (Join-Path $source 'package.json'), (Join-Path $source 'host.json') $stage
    Copy-Item (Join-Path $source 'src') $stage -Recurse
    $lock = Join-Path $source 'package-lock.json'
    if (Test-Path -LiteralPath $lock)
    {
        Copy-Item $lock $stage
    }
    if ($variant -eq 'with-customer-exe')
    {
        $vendor = Join-Path $stage 'vendor\otel-native'
        $bin = Join-Path $vendor 'bin\linux-x64'
        New-Item -ItemType Directory -Path $bin -Force | Out-Null
        Copy-Item (Join-Path $nativePackage 'index.js'), (Join-Path $nativePackage 'package.json') $vendor
        Copy-Item (Join-Path $nativePackage 'lib') $vendor -Recurse
        Copy-Item $exe.FullName (Join-Path $bin 'azfunc-otel')
    }

    if (-not (Test-Path -LiteralPath $lock))
    {
        & $npm --prefix $stage install --package-lock-only --omit=dev --ignore-scripts --install-links
        if ($LASTEXITCODE -ne 0) { throw "Lock generation failed for $variant." }
        Copy-Item (Join-Path $stage 'package-lock.json') $lock
    }
    & $npm --prefix $stage ci --omit=dev --ignore-scripts --install-links
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed for $variant." }

    $installedNative = Join-Path $stage 'node_modules\@azure\functions-opentelemetry-native'
    if ($variant -eq 'with-customer-exe')
    {
        if (-not (Test-Path (Join-Path $installedNative 'bin\linux-x64\azfunc-otel')))
        {
            throw 'The treatment is missing its installed Linux binary.'
        }
    }
    elseif (Test-Path -LiteralPath $installedNative)
    {
        throw "The $variant app unexpectedly contains the OTel package."
    }

    $zipPath = Join-Path $artifacts "$variant.zip"
    # Windows ZipArchive marks entries as DOS, so Unix extractors ignore its execute bits.
    $zipScript = @'
import pathlib, stat, sys, zipfile
root = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2], "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for source in sorted(root.rglob("*")):
        if not source.is_file():
            continue
        relative = source.relative_to(root)
        if relative.parts[0] == "vendor":
            continue
        entry = zipfile.ZipInfo(relative.as_posix())
        entry.create_system = 3
        entry.compress_type = zipfile.ZIP_DEFLATED
        mode = 0o755 if source.name == "azfunc-otel" else 0o644
        entry.external_attr = (stat.S_IFREG | mode) << 16
        archive.writestr(entry, source.read_bytes())
'@
    & python -c $zipScript $stage $zipPath
    if ($LASTEXITCODE -ne 0) { throw "ZIP creation failed for $variant." }
    Write-Host "Prepared $variant : $zipPath ($((Get-Item $zipPath).Length) bytes)"
}
Write-Host "Staged apps: $stageRoot"
