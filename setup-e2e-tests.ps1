
# A function that checks exit codes and fails script if an error is found 
function StopOnFailedExecution {
  if ($LastExitCode) 
  { 
    exit $LastExitCode 
  }
}
Write-Host "$args[0]"
Write-Host $args[0]

$skipCliDownload = $false
if($args[0])
{
$skipCliDownload = $args[0]
}
Write-Host $skipCliDownload

$currDir =  Get-Location
if(!$skipCliDownload)
{
Write-Host "Deleting Functions Core Tools if exists...."
Remove-Item -Force ./Azure.Functions.Cli.zip -ErrorAction Ignore
Remove-Item -Recurse -Force ./Azure.Functions.Cli -ErrorAction Ignore

Write-Host "Downloading Functions Core Tools...."
Invoke-RestMethod -Uri 'https://functionsclibuilds.blob.core.windows.net/builds/2/latest/version.txt' -OutFile version.txt
Write-Host "Using Functions Core Tools version: $(Get-Content -Raw version.txt)"
Remove-Item version.txt

$url = "https://functionsclibuilds.blob.core.windows.net/builds/2/latest/Azure.Functions.Cli.win-x86.zip"
$output = "$currDir\Azure.Functions.Cli.zip"
$wc = New-Object System.Net.WebClient
$wc.DownloadFile($url, $output)

Write-Host "Extracting Functions Core Tools...."
Expand-Archive ".\Azure.Functions.Cli.zip" -DestinationPath ".\Azure.Functions.Cli"
}

Write-Host "Copying azure-functions-nodejs-worker to Functions Host workers directory..."

$configuration = if ($env:CONFIGURATION) { $env:CONFIGURATION } else { 'Debug' }
Copy-Item -Recurse -Force "$PSScriptRoot/pkg/" "$currDir/Azure.Functions.Cli/workers/node"

Write-Host "Set up func.exe..."

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

start-process -filepath "c:\projects\azure-functions-nodejs-worker\Azure.Functions.Cli\func.exe" -WorkingDirectory "c:\projects\azure-functions-nodejs-worker\test\end-to-end\testFunctionApp" -ArgumentList "extensions install"
StopOnFailedExecution
Start-Sleep -s 30