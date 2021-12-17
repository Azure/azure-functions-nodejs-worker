param (
  [string]$pkgDir
)

$grpcDir = "$pkgDir/grpc"

New-Item $pkgDir/deps/grpc/etc/ -Type Directory
New-Item $grpcDir -Type Directory
copy-item ./node_modules/grpc/deps/grpc/etc/roots.pem $pkgDir/deps/grpc/etc/
copy-item ./node_modules/grpc/package.json $grpcDir

# Node 8 support
./node_modules/.bin/node-pre-gyp install -C $grpcDir --target_arch=ia32 --target=8.4.0 --target_platform=win32
./node_modules/.bin/node-pre-gyp install -C $grpcDir --target_arch=ia32 --target=8.4.0 --target_platform=darwin
./node_modules/.bin/node-pre-gyp install -C $grpcDir --target_arch=ia32 --target=8.4.0 --target_platform=linux --target_libc=glibc
./node_modules/.bin/node-pre-gyp install -C $grpcDir --target_arch=x64 --target=8.4.0 --target_platform=win32
./node_modules/.bin/node-pre-gyp install -C $grpcDir --target_arch=x64 --target=8.4.0 --target_platform=darwin
./node_modules/.bin/node-pre-gyp install -C $grpcDir --target_arch=x64 --target=8.4.0 --target_platform=linux --target_libc=glibc
# Node 10 support
./node_modules/.bin/node-pre-gyp install -C $grpcDir --target_arch=ia32 --target=10.1.0 --target_platform=win32
./node_modules/.bin/node-pre-gyp install -C $grpcDir --target_arch=ia32 --target=10.1.0 --target_platform=darwin
./node_modules/.bin/node-pre-gyp install -C $grpcDir --target_arch=ia32 --target=10.1.0 --target_platform=linux --target_libc=glibc
./node_modules/.bin/node-pre-gyp install -C $grpcDir --target_arch=x64 --target=10.1.0 --target_platform=win32
./node_modules/.bin/node-pre-gyp install -C $grpcDir --target_arch=x64 --target=10.1.0 --target_platform=darwin
./node_modules/.bin/node-pre-gyp install -C $grpcDir --target_arch=x64 --target=10.1.0 --target_platform=linux --target_libc=glibc
# Node 12 support
./node_modules/.bin/node-pre-gyp install -C $grpcDir --target_arch=ia32 --target=12.13.0 --target_platform=win32
./node_modules/.bin/node-pre-gyp install -C $grpcDir --target_arch=ia32 --target=12.13.0 --target_platform=darwin
./node_modules/.bin/node-pre-gyp install -C $grpcDir --target_arch=ia32 --target=12.13.0 --target_platform=linux --target_libc=glibc
./node_modules/.bin/node-pre-gyp install -C $grpcDir --target_arch=x64 --target=12.13.0 --target_platform=win32
./node_modules/.bin/node-pre-gyp install -C $grpcDir --target_arch=x64 --target=12.13.0 --target_platform=darwin
./node_modules/.bin/node-pre-gyp install -C $grpcDir --target_arch=x64 --target=12.13.0 --target_platform=linux --target_libc=glibc
# Node 14 preview support
./node_modules/.bin/node-pre-gyp install -C $grpcDir --target_arch=ia32 --target=14.10.1 --target_platform=win32
./node_modules/.bin/node-pre-gyp install -C $grpcDir --target_arch=ia32 --target=14.10.1 --target_platform=darwin
./node_modules/.bin/node-pre-gyp install -C $grpcDir --target_arch=ia32 --target=14.10.1 --target_platform=linux --target_libc=glibc
./node_modules/.bin/node-pre-gyp install -C $grpcDir --target_arch=x64 --target=14.10.1 --target_platform=win32
./node_modules/.bin/node-pre-gyp install -C $grpcDir --target_arch=x64 --target=14.10.1 --target_platform=darwin
./node_modules/.bin/node-pre-gyp install -C $grpcDir --target_arch=x64 --target=14.10.1 --target_platform=linux --target_libc=glibc
