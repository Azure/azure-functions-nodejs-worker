#
# Copyright (c) Microsoft. All rights reserved.
# Licensed under the MIT license. See LICENSE file in the project root for full license information.
#

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

$TEST_SCRIPT_ROOT = "$PSScriptRoot/test/end-to-end"
$FUNC_CLI_DOWNLOAD_URL = "https://functionsclibuilds.blob.core.windows.net/builds/2/latest/Azure.Functions.Cli.$os-$arch.zip"
$FUNC_CLI_DIRECTORY = Join-Path $TEST_SCRIPT_ROOT 'Azure.Functions.Cli'

Write-Host 'Deleting Functions Core Tools if exists...'
Remove-Item -Force "$FUNC_CLI_DIRECTORY.zip" -ErrorAction Ignore
Remove-Item -Recurse -Force $FUNC_CLI_DIRECTORY -ErrorAction Ignore

$version = Invoke-RestMethod -Uri 'https://functionsclibuilds.blob.core.windows.net/builds/2/latest/version.txt'
Write-Host "Downloading Functions Core Tools (Version: $version)..."

$output = "$FUNC_CLI_DIRECTORY.zip"

Invoke-RestMethod -Uri $FUNC_CLI_DOWNLOAD_URL -OutFile $output

Write-Host 'Extracting Functions Core Tools...'
Expand-Archive $output -DestinationPath $FUNC_CLI_DIRECTORY

Write-Host "Copying azure-functions-nodejs-worker to Functions Host workers directory..."

$configuration = if ($env:CONFIGURATION) { $env:CONFIGURATION } else { 'Debug' }
Copy-Item -Recurse -Force "$PSScriptRoot/pkg/" "$FUNC_CLI_DIRECTORY/workers/node"

Write-Host "Installing extensions..."

$Env:AzureWebJobsScriptRoot = "$TEST_SCRIPT_ROOT/testFunctionApp"
$Env:FUNCTIONS_WORKER_RUNTIME = "node"
$Env:AZURE_FUNCTIONS_ENVIRONMENT = "development"
$Env:Path = "$Env:Path$([System.IO.Path]::PathSeparator)$FUNC_CLI_DIRECTORY"
$funcExePath = Join-Path $FUNC_CLI_DIRECTORY $FUNC_EXE_NAME

Push-Location $Env:AzureWebJobsScriptRoot

if ($IsMacOS -or $IsLinux) {
    chmod +x $funcExePath
}

Write-Host "Installing extensions..."
start-process -filepath $funcExePath -WorkingDirectory "$TEST_SCRIPT_ROOT/testFunctionApp" -ArgumentList "extensions install"
Start-Sleep -s 30