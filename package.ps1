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
remove-item pkg -Recurse -ErrorAction Ignore
New-Item ./pkg/deps/grpc/etc/ -Type Directory
New-Item ./pkg/grpc/ -Type Directory
New-Item ./pkg/dist/src -Type Directory
copy-item ./node_modules/grpc/deps/grpc/etc/roots.pem ./pkg/deps/grpc/etc/
copy-item ./node_modules/grpc/package.json ./pkg/grpc/
copy-item ./dist/src/nodejsWorker.js ./pkg/dist/src/
copy-item ./worker.config.json pkg
./node_modules/.bin/webpack
StopOnFailedExecution # fail if error
# Node 8 support
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=ia32 --target=8.4.0 --target_platform=win32
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=ia32 --target=8.4.0 --target_platform=darwin
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=ia32 --target=8.4.0 --target_platform=linux --target_libc=glibc
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=x64 --target=8.4.0 --target_platform=win32
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=x64 --target=8.4.0 --target_platform=darwin
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=x64 --target=8.4.0 --target_platform=linux --target_libc=glibc
# Node 10 support
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=ia32 --target=10.1.0 --target_platform=win32
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=ia32 --target=10.1.0 --target_platform=darwin
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=ia32 --target=10.1.0 --target_platform=linux --target_libc=glibc
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=x64 --target=10.1.0 --target_platform=win32
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=x64 --target=10.1.0 --target_platform=darwin
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=x64 --target=10.1.0 --target_platform=linux --target_libc=glibc
# Node 12 support
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=ia32 --target=12.13.0 --target_platform=win32
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=ia32 --target=12.13.0 --target_platform=darwin
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=ia32 --target=12.13.0 --target_platform=linux --target_libc=glibc
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=x64 --target=12.13.0 --target_platform=win32
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=x64 --target=12.13.0 --target_platform=darwin
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=x64 --target=12.13.0 --target_platform=linux --target_libc=glibc
# Node 14 preview support
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=ia32 --target=14.10.1 --target_platform=win32
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=ia32 --target=14.10.1 --target_platform=darwin
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=ia32 --target=14.10.1 --target_platform=linux --target_libc=glibc
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=x64 --target=14.10.1 --target_platform=win32
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=x64 --target=14.10.1 --target_platform=darwin
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=x64 --target=14.10.1 --target_platform=linux --target_libc=glibc

copy-item Worker.nuspec pkg/

if ($NugetPack)
{
  set-location pkg
  nuget pack -Properties version=$buildNumber
  StopOnFailedExecution # fail if error
  set-location ..
}
