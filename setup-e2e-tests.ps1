
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
Copy-Item -Recurse -Force "$PSScriptRoot/pkg/" "$currDir/Azure.Functions.Cli/workers/node"

Write-Host "Installing extensions..."
cd "$currDir\test\end-to-end\testFunctionApp"
& "$currDir\Azure.Functions.Cli\func.exe" extensions install | %{    
  if ($_ -match 'OK')    
  { Write-Host $_ -f Green }    
  elseif ($_ -match 'FAIL|ERROR')   
  { Write-Host $_ -f Red }   
  else    
  { Write-Host $_ }    
}
StopOnFailedExecution
cd $currDir

Write-Host "Starting functions host..."
$proc = start-process -NoNewWindow -PassThru -filepath "$currDir\Azure.Functions.Cli\func.exe" -WorkingDirectory "$currDir\test\end-to-end\testFunctionApp" -ArgumentList "host start" -RedirectStandardOutput "output.txt"
Start-Sleep -s 30

Write-Host "Running E2E tests..."
./run-e2e-tests.ps1

Write-Host "Closing process..."
Stop-Process -Id $proc.Id -Erroraction Ignore 

Write-Host "Host Logs:"
$host_logs = Get-Content -Path "output.txt" -Raw
Write-Host $host_logs
Remove-Item -Path "output.txt"