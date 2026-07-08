use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::json;
use toml::Value;
use walkdir::WalkDir;

use crate::artifacts::{PackagedArtifact, collect_artifacts};
use crate::errors::{PackagerError, Result};
use crate::metadata::ResolvedMetadata;
use crate::targets::DesktopTarget;

#[derive(Debug)]
pub struct TauriBuildRequest {
    pub workspace_root: PathBuf,
    pub export_root: PathBuf,
    pub out_dir: PathBuf,
    pub metadata: ResolvedMetadata,
    pub targets: Vec<DesktopTarget>,
    pub keep_temp: bool,
    pub verbose: bool,
}

#[derive(Debug)]
pub struct TauriBuildOutcome {
    pub artifacts: Vec<PackagedArtifact>,
    pub temp_root: Option<PathBuf>,
    pub override_config_path: PathBuf,
}

pub fn build(request: TauriBuildRequest) -> Result<TauriBuildOutcome> {
    check_prerequisites(&request.targets)?;

    let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let shell_source = repo_root.join("tauri-shell");
    if !shell_source.is_dir() {
        return Err(PackagerError::MissingTauriShell { path: shell_source });
    }

    let shell_workspace = request.workspace_root.join("tauri-shell");
    copy_directory(&shell_source, &shell_workspace)?;
    configure_shell_manifest(&shell_workspace, &request.metadata)?;

    if let Some(icon) = &request.metadata.icon {
        run_icon_generation(&shell_workspace, icon, request.verbose)?;
    }

    let override_config_path =
        generate_override_config(&shell_workspace, &request.export_root, &request.metadata)?;

    let mut artifacts = Vec::new();
    for target in &request.targets {
        let mut arguments = vec![
            OsString::from("tauri"),
            OsString::from("build"),
            OsString::from("--config"),
            override_config_path.as_os_str().to_os_string(),
        ];

        if request.verbose {
            arguments.push(OsString::from("--verbose"));
        }

        run_cargo_command(&shell_workspace, &arguments, request.verbose)?;

        let mut target_artifacts = collect_artifacts(
            &shell_workspace.join("src-tauri"),
            &request.out_dir,
            *target,
            &request.metadata,
        )?;
        artifacts.append(&mut target_artifacts);
    }

    let temp_root = if request.keep_temp {
        Some(request.workspace_root)
    } else {
        None
    };

    Ok(TauriBuildOutcome {
        artifacts,
        temp_root,
        override_config_path,
    })
}

fn check_prerequisites(targets: &[DesktopTarget]) -> Result<()> {
    if std::env::consts::OS != "linux" || !targets.contains(&DesktopTarget::Linux) {
        return Ok(());
    }

    for dependency in ["webkit2gtk-4.1", "javascriptcoregtk-4.1"] {
        let status = Command::new("pkg-config")
            .arg("--exists")
            .arg(dependency)
            .status()
            .map_err(|source| PackagerError::SpawnCommand {
                program: format!("pkg-config --exists {dependency}"),
                source,
            })?;

        if !status.success() {
            return Err(PackagerError::MissingSystemDependency {
                dependency: dependency.to_string(),
                hint: "install the Tauri Linux prerequisites, e.g. on Arch: `sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module libappindicator-gtk3 librsvg xdotool`".to_string(),
            });
        }
    }

    Ok(())
}

fn run_icon_generation(shell_workspace: &Path, icon: &Path, verbose: bool) -> Result<()> {
    let output_dir = shell_workspace.join("src-tauri").join("icons");
    let args = [
        OsString::from("tauri"),
        OsString::from("icon"),
        icon.as_os_str().to_os_string(),
        OsString::from("-o"),
        output_dir.as_os_str().to_os_string(),
    ];

    run_cargo_command(shell_workspace, &args, verbose)
}

fn generate_override_config(
    shell_workspace: &Path,
    export_root: &Path,
    metadata: &ResolvedMetadata,
) -> Result<PathBuf> {
    let icons_dir = shell_workspace.join("src-tauri").join("icons");
    let icon_entries = default_icon_entries(&icons_dir)
        .into_iter()
        .filter(|path| path.is_file())
        .map(|path| {
            path.strip_prefix(shell_workspace)
                .unwrap_or(path.as_path())
                .to_string_lossy()
                .replace('\\', "/")
        })
        .collect::<Vec<_>>();

    let override_config = json!({
        "productName": metadata.title,
        "identifier": metadata.identifier,
        "version": metadata.version,
        "build": {
            "frontendDist": export_root.to_string_lossy(),
            "beforeBuildCommand": ""
        },
        "app": {
            "windows": [{
                "title": metadata.title,
                "width": 1280,
                "height": 720,
                "resizable": true
            }]
        },
        "bundle": bundle_config(icon_entries)
    });

    let path = shell_workspace.join("routevn.generated.conf.json");
    let serialized = serde_json::to_string_pretty(&override_config).expect("valid JSON");
    fs::write(&path, serialized).map_err(|source| PackagerError::WriteFile {
        path: path.clone(),
        source,
    })?;

    Ok(path)
}

fn configure_shell_manifest(shell_workspace: &Path, metadata: &ResolvedMetadata) -> Result<()> {
    let manifest_path = shell_workspace.join("src-tauri").join("Cargo.toml");
    let manifest_text =
        fs::read_to_string(&manifest_path).map_err(|source| PackagerError::ReadFile {
            path: manifest_path.clone(),
            source,
        })?;
    let mut manifest =
        manifest_text
            .parse::<Value>()
            .map_err(|error| PackagerError::ConfigParse {
                path: manifest_path.clone(),
                message: error.to_string(),
            })?;

    let package = manifest
        .get_mut("package")
        .and_then(Value::as_table_mut)
        .expect("generated Tauri manifest contains [package]");
    package.insert(
        "name".to_string(),
        Value::String(metadata.binary_name.clone()),
    );
    package.insert(
        "version".to_string(),
        Value::String(metadata.version.clone()),
    );
    package.insert(
        "description".to_string(),
        Value::String(format!("RouteVN desktop shell for {}", metadata.title)),
    );

    let lib_name = shell_lib_name(metadata);
    let lib = manifest
        .get_mut("lib")
        .and_then(Value::as_table_mut)
        .expect("generated Tauri manifest contains [lib]");
    lib.insert("name".to_string(), Value::String(lib_name.clone()));

    fs::write(
        &manifest_path,
        toml::to_string_pretty(&manifest).expect("manifest remains serializable"),
    )
    .map_err(|source| PackagerError::WriteFile {
        path: manifest_path.clone(),
        source,
    })?;

    let main_rs_path = shell_workspace
        .join("src-tauri")
        .join("src")
        .join("main.rs");
    let main_rs = format!(
        "// Prevents additional console window on Windows in release, DO NOT REMOVE!!\n#![cfg_attr(not(debug_assertions), windows_subsystem = \"windows\")]\n\nfn main() {{\n    {lib_name}::run();\n}}\n"
    );
    fs::write(&main_rs_path, main_rs).map_err(|source| PackagerError::WriteFile {
        path: main_rs_path,
        source,
    })?;

    Ok(())
}

fn bundle_config(icon_entries: Vec<String>) -> serde_json::Value {
    if icon_entries.is_empty() {
        json!({ "active": true })
    } else {
        json!({
            "active": true,
            "icon": icon_entries
        })
    }
}

fn shell_lib_name(metadata: &ResolvedMetadata) -> String {
    format!("{}_lib", metadata.binary_name.replace('-', "_"))
}

fn default_icon_entries(icons_dir: &Path) -> Vec<PathBuf> {
    [
        "32x32.png",
        "128x128.png",
        "128x128@2x.png",
        "icon.icns",
        "icon.ico",
    ]
    .into_iter()
    .map(|name| icons_dir.join(name))
    .collect()
}

fn run_cargo_command(current_dir: &Path, args: &[OsString], verbose: bool) -> Result<()> {
    let output = Command::new("cargo")
        .args(args)
        .current_dir(current_dir)
        .output()
        .map_err(|source| PackagerError::SpawnCommand {
            program: format!("cargo {}", join_os_strings(args)),
            source,
        })?;

    if verbose {
        if !output.stdout.is_empty() {
            print!("{}", String::from_utf8_lossy(&output.stdout));
        }
        if !output.stderr.is_empty() {
            eprint!("{}", String::from_utf8_lossy(&output.stderr));
        }
    }

    if output.status.success() {
        Ok(())
    } else {
        Err(PackagerError::CommandFailed {
            program: format!("cargo {}", join_os_strings(args)),
            status: output.status,
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        })
    }
}

fn join_os_strings(values: &[OsString]) -> String {
    values
        .iter()
        .map(|value| value.to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join(" ")
}

fn copy_directory(source: &Path, destination: &Path) -> Result<()> {
    for entry in WalkDir::new(source) {
        let entry = entry.map_err(|error| PackagerError::ReadFile {
            path: source.to_path_buf(),
            source: std::io::Error::other(error),
        })?;

        let source_path = entry.path();
        let relative = source_path
            .strip_prefix(source)
            .expect("walkdir entries are inside the source directory");
        let destination_path = destination.join(relative);

        if entry.file_type().is_dir() {
            fs::create_dir_all(&destination_path).map_err(|source_error| {
                PackagerError::CreateDir {
                    path: destination_path,
                    source: source_error,
                }
            })?;
        } else {
            if let Some(parent) = destination_path.parent() {
                fs::create_dir_all(parent).map_err(|source_error| PackagerError::CreateDir {
                    path: parent.to_path_buf(),
                    source: source_error,
                })?;
            }

            fs::copy(source_path, &destination_path).map_err(|source_error| {
                PackagerError::Copy {
                    from: source_path.to_path_buf(),
                    to: destination_path,
                    source: source_error,
                }
            })?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::{configure_shell_manifest, generate_override_config, shell_lib_name};
    use crate::metadata::ResolvedMetadata;

    #[test]
    fn generated_override_contains_expected_fields() {
        let temp = tempdir().unwrap();
        let shell = temp.path().join("tauri-shell");
        std::fs::create_dir_all(shell.join("src-tauri/icons")).unwrap();
        std::fs::write(shell.join("src-tauri/icons/32x32.png"), "").unwrap();

        let export_root = temp.path().join("export");
        std::fs::create_dir_all(&export_root).unwrap();

        let path = generate_override_config(
            &shell,
            &export_root,
            &ResolvedMetadata {
                title: "Sample App".to_string(),
                identifier: "vn.routevn.sample-app".to_string(),
                version: "1.2.3".to_string(),
                icon: None,
                binary_name: "sample-app".to_string(),
            },
        )
        .unwrap();

        let json: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        assert_eq!(json["productName"], "Sample App");
        assert_eq!(json["identifier"], "vn.routevn.sample-app");
        assert_eq!(json["version"], "1.2.3");
        assert_eq!(
            json["build"]["frontendDist"],
            export_root.to_string_lossy().as_ref()
        );
        assert_eq!(json["app"]["windows"][0]["title"], "Sample App");
    }

    #[test]
    fn shell_manifest_is_rewritten_for_binary_name() {
        let temp = tempdir().unwrap();
        let shell = temp.path().join("tauri-shell");
        std::fs::create_dir_all(shell.join("src-tauri/src")).unwrap();
        std::fs::write(
            shell.join("src-tauri/Cargo.toml"),
            r#"[package]
name = "app"
version = "0.1.0"
description = "A Tauri App"

[lib]
name = "app_lib"
crate-type = ["staticlib", "cdylib", "rlib"]
"#,
        )
        .unwrap();

        let metadata = ResolvedMetadata {
            title: "Sample App".to_string(),
            identifier: "vn.routevn.sample-app".to_string(),
            version: "1.2.3".to_string(),
            icon: None,
            binary_name: "sample-app".to_string(),
        };
        configure_shell_manifest(&shell, &metadata).unwrap();

        let manifest = std::fs::read_to_string(shell.join("src-tauri/Cargo.toml")).unwrap();
        let main_rs = std::fs::read_to_string(shell.join("src-tauri/src/main.rs")).unwrap();

        assert!(manifest.contains("name = \"sample-app\""));
        assert!(manifest.contains(&format!("name = \"{}\"", shell_lib_name(&metadata))));
        assert!(main_rs.contains("sample_app_lib::run();"));
    }
}
