param (
  [Switch]$NugetPack,
  [string]$buildNumber = $env:name
)

# A function that checks exit codes and fails script if an error is found 
function StopOnFailedExecution {
  if ($LastExitCode) 
  { 
    exit $LastExitCode 
  }
}

Write-Host "buildNumber: " $buildNumber
npm install
npm run build-nomaps 
remove-item pkg -Recurse -ErrorAction Ignore
New-Item ./pkg/dist/src -Type Directory
copy-item ./dist/src/nodejsWorker.js ./pkg/dist/src/
copy-item ./worker.config.json pkg
./node_modules/.bin/webpack
StopOnFailedExecution # fail if error


copy-item Worker.nuspec pkg/

if ($NugetPack)
{
  set-location pkg
  nuget pack -Properties version=$buildNumber
  StopOnFailedExecution # fail if error
  set-location ..
}
