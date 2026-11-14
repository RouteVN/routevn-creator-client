//! Template build helper: validates a built player template and writes its
//! descriptor.
//!
//! Usage:
//!   routevn-android-template describe --apk <template.apk> --out <descriptor.json>
//!   routevn-android-template describe-bundle --aab <template.aab> --out <descriptor.json>

use std::path::{Path, PathBuf};
use std::process::ExitCode;

use serde::Serialize;

const USAGE: &str = "Usage: routevn-android-template describe --apk <template.apk> --out <descriptor.json>\n       routevn-android-template describe-bundle --aab <template.aab> --out <descriptor.json>";

fn write_descriptor(out: &Path, descriptor: &impl Serialize) -> bool {
    let mut json = serde_json::to_string_pretty(descriptor).expect("descriptor serializes");
    json.push('\n');
    if let Err(error) = std::fs::write(out, json) {
        eprintln!("Failed to write {}: {error}", out.display());
        return false;
    }
    true
}

fn main() -> ExitCode {
    let mut args = std::env::args().skip(1);
    let command = args.next();
    let mut apk = None;
    let mut aab = None;
    let mut out = None;
    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--apk" => apk = args.next().map(PathBuf::from),
            "--aab" => aab = args.next().map(PathBuf::from),
            "--out" => out = args.next().map(PathBuf::from),
            other => {
                eprintln!("Unknown argument {other}");
                return ExitCode::from(2);
            }
        }
    }

    let summary = match (command.as_deref(), apk, aab, out) {
        (Some("describe"), Some(apk), None, Some(out)) => {
            routevn_android_export::template::describe(&apk).map(|descriptor| {
                write_descriptor(&out, &descriptor).then(|| {
                    format!(
                        "Template {} ({}) is valid: {} icon files, ABIs {}",
                        descriptor.template_version_name,
                        descriptor.template_version_code,
                        descriptor.images.len(),
                        descriptor.abis.join(", ")
                    )
                })
            })
        }
        (Some("describe-bundle"), None, Some(aab), Some(out)) => {
            routevn_android_export::bundle::describe(&aab).map(|descriptor| {
                write_descriptor(&out, &descriptor).then(|| {
                    format!(
                        "Template bundle {} ({}) is valid: {} icon files, ABIs {}",
                        descriptor.template_version_name,
                        descriptor.template_version_code,
                        descriptor.images.len(),
                        descriptor.abis.join(", ")
                    )
                })
            })
        }
        _ => {
            eprintln!("{USAGE}");
            return ExitCode::from(2);
        }
    };
    match summary {
        Ok(Some(summary)) => {
            println!("{summary}");
            ExitCode::SUCCESS
        }
        Ok(None) => ExitCode::FAILURE,
        Err(error) => {
            eprintln!("Invalid template: {error}");
            ExitCode::FAILURE
        }
    }
}
