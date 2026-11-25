// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License.

use azure_functions_otel_exe::{Pipeline, Settings};
use std::{
    io::{self, BufRead},
    process::ExitCode,
    time::Instant,
};

const MAX_REPORTED_ERRORS: u32 = 10;

fn main() -> ExitCode {
    let started = Instant::now();
    let (settings, warnings) = match Settings::from_lookup(|name| std::env::var(name).ok()) {
        Ok(resolved) => resolved,
        Err(error) => {
            eprintln!("[azfunc-otel] {error:#}");
            return ExitCode::FAILURE;
        }
    };
    for warning in warnings {
        eprintln!("[azfunc-otel] warning: {warning}");
    }
    let pipeline = match Pipeline::new(&settings) {
        Ok(pipeline) => pipeline,
        Err(error) => {
            eprintln!("[azfunc-otel] failed to start the {} exporter: {error:#}", settings.exporter.as_str());
            return ExitCode::FAILURE;
        }
    };
    println!(
        "[azfunc-otel] ready pid={} exporter={} startup={}ms",
        std::process::id(),
        settings.exporter.as_str(),
        started.elapsed().as_millis()
    );

    let mut errors = 0u32;
    for line in io::stdin().lock().lines() {
        let line = match line {
            Ok(line) => line,
            Err(error) => {
                eprintln!("[azfunc-otel] stdin closed: {error}");
                break;
            }
        };
        if line.trim().is_empty() {
            continue;
        }
        if let Err(error) = pipeline.handle_line(&line) {
            errors += 1;
            if errors <= MAX_REPORTED_ERRORS {
                eprintln!("[azfunc-otel] dropped record: {error:#}");
            }
        }
    }

    // stdin reaches EOF when the Node.js worker exits or the app calls shutdown().
    match pipeline.shutdown() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("[azfunc-otel] shutdown failed: {error:#}");
            ExitCode::FAILURE
        }
    }
}
