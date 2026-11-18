// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let protos = std::path::PathBuf::from("..")
        .join("azure-functions-language-worker-protobuf")
        .join("src")
        .join("proto");
    println!("cargo:rerun-if-changed={}", protos.display());
    println!("cargo:rerun-if-env-changed=PROTOC");
    // Generate from the same authoritative schema as the existing worker, including all bindings.
    tonic_prost_build::configure()
        .build_server(false)
        .compile_protos(&[protos.join("FunctionRpc.proto")], &[protos])?;
    Ok(())
}
