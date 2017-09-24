npm install
npm run build-nomaps 
remove-item pkg -Recurse -ErrorAction Ignore
mkdir ./pkg/grpc/etc
mkdir ./pkg/dist/src
copy-item ./node_modules/grpc/etc/roots.pem ./pkg/grpc/etc/
copy-item ./node_modules/grpc/package.json ./pkg/grpc/
copy-item ./dist/src/nodejsWorker.js ./pkg/dist/src/
./node_modules/.bin/webpack
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=ia32 --target=8.4.0 --target_platform=win32
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=ia32 --target=8.4.0 --target_platform=darwin
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=ia32 --target=8.4.0 --target_platform=linux
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=x64 --target=8.4.0 --target_platform=win32
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=x64 --target=8.4.0 --target_platform=darwin
./node_modules/.bin/node-pre-gyp install -C pkg/grpc --target_arch=x64 --target=8.4.0 --target_platform=linux
copy-item Worker.nuspec pkg/
set-location pkg
nuget pack -Properties version=$env:APPVEYOR_BUILD_NUMBER
set-location ..