#
# Copyright (c) Microsoft. All rights reserved.
# Licensed under the MIT license. See LICENSE file in the project root for full license information.
#
param
(
    [Switch]
    $UseCoreToolsBuildFromIntegrationTests
)

$arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
if ($IsWindows) {
    $FUNC_EXE_NAME = "func.exe"
    $os = "win"
} else {
    $FUNC_EXE_NAME = "func"
    if ($IsMacOS) {
        $os = "osx"
    } else {
        $os = "linux"
    }
}

$FUNC_RUNTIME_VERSION = '4'
$coreToolsDownloadURL = $null
if ($UseCoreToolsBuildFromIntegrationTests.IsPresent)
{
    Write-Host "Install Functions Core Tools for integration tests" -fore Green
    $coreToolsDownloadURL = "https://functionsintegclibuilds.blob.core.windows.net/builds/$FUNC_RUNTIME_VERSION/latest/Azure.Functions.Cli.$os-$arch.zip"
    $env:CORE_TOOLS_URL = "https://functionsintegclibuilds.blob.core.windows.net/builds/$FUNC_RUNTIME_VERSION/latest"
}
else
{
    $coreToolsDownloadURL = "https://functionsclibuilds.blob.core.windows.net/builds/$FUNC_RUNTIME_VERSION/latest/Azure.Functions.Cli.$os-$arch.zip"
    if (-not $env:CORE_TOOLS_URL)
    {
        $env:CORE_TOOLS_URL = "https://functionsclibuilds.blob.core.windows.net/builds/$FUNC_RUNTIME_VERSION/latest"
    }
}

$FUNC_CLI_DIRECTORY = Join-Path $PSScriptRoot 'Azure.Functions.Cli'

Write-Host 'Deleting Functions Core Tools if exists...'
Remove-Item -Force "$FUNC_CLI_DIRECTORY.zip" -ErrorAction Ignore
Remove-Item -Recurse -Force $FUNC_CLI_DIRECTORY -ErrorAction Ignore

$version = Invoke-RestMethod -Uri "$env:CORE_TOOLS_URL/version.txt"
$version = $version.Trim()
Write-Host "Downloading Functions Core Tools (Version: $version)..."

$output = "$FUNC_CLI_DIRECTORY.zip"
Write-Host "Functions Core Tools download URL: $coreToolsDownloadURL"
Invoke-RestMethod -Uri $coreToolsDownloadURL -OutFile $output

Write-Host 'Extracting Functions Core Tools...'
Expand-Archive $output -DestinationPath $FUNC_CLI_DIRECTORY

if ($UseCoreToolsBuildFromIntegrationTests.IsPresent)
{
    Write-Host "Set Node worker directory"
    $nodeWorkerFolderPath = [IO.Path]::Join($FUNC_CLI_DIRECTORY, 'workers', 'node')

    if (-not (Test-Path $nodeWorkerFolderPath))
    {
        throw "Path '$nodeWorkerFolderPath' does not exist"
    }

    $workerDirectory = "languageWorkers:node:workerDirectory"
    $env:workerDirectory = $nodeWorkerFolderPath
    Write-Host "env:languageWorkers:node:workerDirectory = '$env:workerDirectory'"
}

$funcExePath = Join-Path $FUNC_CLI_DIRECTORY $FUNC_EXE_NAME

Write-Host "Installing extensions..."
Push-Location "$PSScriptRoot/test/end-to-end/testFunctionApp"

& $funcExePath extensions install | ForEach-Object {
  if ($_ -match 'OK')    
  { Write-Host $_ -f Green }    
  elseif ($_ -match 'FAIL|ERROR')   
  { Write-Host $_ -f Red }   
  else    
  { Write-Host $_ }    
}

if ($LASTEXITCODE -ne 0)
{
  throw "Installing extensions failed."
}

Pop-Location
