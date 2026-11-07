//! Template build helper: validates a built player template APK and writes
//! its descriptor.
//!
//! Usage: routevn-android-template describe --apk <template.apk> --out <descriptor.json>

use std::path::PathBuf;
use std::process::ExitCode;

fn main() -> ExitCode {
    let mut args = std::env::args().skip(1);
    let command = args.next();
    let mut apk = None;
    let mut out = None;
    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--apk" => apk = args.next().map(PathBuf::from),
            "--out" => out = args.next().map(PathBuf::from),
            other => {
                eprintln!("Unknown argument {other}");
                return ExitCode::from(2);
            }
        }
    }
    let (Some("describe"), Some(apk), Some(out)) = (command.as_deref(), apk, out) else {
        eprintln!(
            "Usage: routevn-android-template describe --apk <template.apk> --out <descriptor.json>"
        );
        return ExitCode::from(2);
    };

    match routevn_android_export::template::describe(&apk) {
        Ok(descriptor) => {
            let mut json =
                serde_json::to_string_pretty(&descriptor).expect("descriptor serializes");
            json.push('\n');
            if let Err(error) = std::fs::write(&out, json) {
                eprintln!("Failed to write {}: {error}", out.display());
                return ExitCode::FAILURE;
            }
            println!(
                "Template {} ({}) is valid: {} icon files, ABIs {}",
                descriptor.template_version_name,
                descriptor.template_version_code,
                descriptor.images.len(),
                descriptor.abis.join(", ")
            );
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("Invalid template: {error}");
            ExitCode::FAILURE
        }
    }
}
