use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};

use clap::{Args, Parser, Subcommand};
use tempfile::tempdir;

use crate::errors::{PackagerError, Result};
use crate::installer::{self, InstallerRequest};
use crate::metadata::{MetadataOverrides, PackagerConfig, ResolvedMetadata};
use crate::payload::{
    AppendChunkedPayloadRequest, DEFAULT_PAYLOAD_CHUNK_SIZE, PayloadKey, PayloadNonce,
    append_chunked_encrypted_payload, generate_payload_key_material, parse_payload_key_hex,
    parse_payload_nonce_hex,
};
use crate::targets::{DesktopTarget, HostPlatform, resolve_targets};
use crate::tauri::{self, TauriBuildRequest};
use crate::windows_resources::{
    WindowsResourceMetadata, WindowsResourceStampRequest, stamp_windows_resources,
};
use crate::zip::{ensure_export_root, extract_zip, locate_export_root};

#[derive(Debug, Parser)]
#[command(
    name = "routevn-packager",
    version,
    about = "Package RouteVN web exports into native desktop apps"
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
enum Commands {
    Build(BuildArgs),
    StampExe(StampExeArgs),
    BuildInstaller(BuildInstallerArgs),
}

#[derive(Debug, Args)]
struct BuildArgs {
    input: PathBuf,

    #[arg(long)]
    out: PathBuf,

    #[arg(long)]
    config: Option<PathBuf>,

    #[arg(long)]
    title: Option<String>,

    #[arg(long)]
    identifier: Option<String>,

    #[arg(long)]
    version: Option<String>,

    #[arg(long)]
    icon: Option<PathBuf>,

    #[arg(long = "target", value_enum)]
    targets: Vec<DesktopTarget>,

    #[arg(long)]
    keep_temp: bool,

    #[arg(long)]
    verbose: bool,
}

#[derive(Debug, Args)]
struct StampExeArgs {
    #[arg(long)]
    template: PathBuf,

    #[arg(long)]
    payload: PathBuf,

    #[arg(long)]
    out: PathBuf,

    #[arg(long)]
    title: String,

    #[arg(long)]
    version: String,

    #[arg(long)]
    publisher: Option<String>,

    #[arg(long)]
    icon: PathBuf,

    #[arg(long)]
    key_hex: Option<String>,

    #[arg(long)]
    nonce_hex: Option<String>,
}

#[derive(Debug, Args)]
struct BuildInstallerArgs {
    #[arg(long)]
    exe: PathBuf,

    #[arg(long)]
    out: PathBuf,

    #[arg(long)]
    title: String,

    #[arg(long)]
    version: String,

    #[arg(long)]
    publisher: Option<String>,

    #[arg(long)]
    makensis: Option<PathBuf>,
}

pub fn run<I, T>(args: I) -> Result<()>
where
    I: IntoIterator<Item = T>,
    T: Into<OsString> + Clone,
{
    let cli = Cli::try_parse_from(args)?;

    match cli.command {
        Commands::Build(args) => run_build(args),
        Commands::StampExe(args) => run_stamp_exe(args),
        Commands::BuildInstaller(args) => run_build_installer(args),
    }
}

fn run_stamp_exe(args: StampExeArgs) -> Result<()> {
    let payload = fs::read(&args.payload).map_err(|source| PackagerError::ReadFile {
        path: args.payload.clone(),
        source,
    })?;
    let icon_png = fs::read(&args.icon).map_err(|source| PackagerError::ReadFile {
        path: args.icon.clone(),
        source,
    })?;
    let (key, nonce) = resolve_payload_key_material(&args)?;
    let temp = tempdir().map_err(|source| PackagerError::CreateDir {
        path: std::env::temp_dir(),
        source,
    })?;
    let branded_template_path = temp.path().join("branded-template.exe");
    let original_filename = args
        .out
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| PackagerError::InvalidWindowsResource {
            path: args.out.clone(),
            message: "Windows output file name is required for executable metadata".to_string(),
        })?;
    let resource_outcome = stamp_windows_resources(WindowsResourceStampRequest {
        template_path: &args.template,
        output_path: &branded_template_path,
        metadata: WindowsResourceMetadata {
            title: &args.title,
            version: &args.version,
            application_identifier: None,
            publisher: args.publisher.as_deref(),
            description: None,
            copyright: None,
            original_filename,
        },
        icon_png: &icon_png,
    })?;
    let outcome = append_chunked_encrypted_payload(AppendChunkedPayloadRequest {
        template_path: &branded_template_path,
        output_path: &args.out,
        payload: &payload,
        key,
        nonce,
        chunk_size: DEFAULT_PAYLOAD_CHUNK_SIZE,
    })?;

    println!("Stamped executable: {}", outcome.output_path.display());
    println!(
        "Patched resource bytes: {}",
        resource_outcome.resource_bytes
    );
    println!("Embedded payload bytes: {}", outcome.footer.encrypted_len);

    Ok(())
}

fn run_build_installer(args: BuildInstallerArgs) -> Result<()> {
    let outcome = installer::build_nsis_installer(InstallerRequest {
        exe_path: &args.exe,
        output_path: &args.out,
        title: &args.title,
        version: &args.version,
        application_identifier: None,
        publisher: args.publisher.as_deref(),
        description: None,
        copyright: None,
        makensis_path: args.makensis.as_deref(),
    })?;

    println!("Built installer: {}", outcome.output_path.display());

    Ok(())
}

fn resolve_payload_key_material(args: &StampExeArgs) -> Result<(PayloadKey, PayloadNonce)> {
    match (&args.key_hex, &args.nonce_hex) {
        (Some(key_hex), Some(nonce_hex)) => Ok((
            parse_payload_key_hex(key_hex)?,
            parse_payload_nonce_hex(nonce_hex)?,
        )),
        (None, None) => Ok(generate_payload_key_material()),
        (Some(_), None) | (None, Some(_)) => Err(PackagerError::InvalidEmbeddedPayload {
            path: args.out.clone(),
            message: "key and nonce must both be supplied, or neither so they can be generated"
                .to_string(),
        }),
    }
}

fn run_build(args: BuildArgs) -> Result<()> {
    let host = HostPlatform::current();
    let config = load_config(args.config.as_deref())?;

    let requested_targets = if args.targets.is_empty() {
        config
            .as_ref()
            .and_then(|config| config.targets.clone())
            .unwrap_or_default()
    } else {
        args.targets.clone()
    };
    let targets = resolve_targets(host, &requested_targets)?;

    let metadata = ResolvedMetadata::resolve(
        &args.input,
        config.as_ref(),
        &MetadataOverrides {
            title: args.title.clone(),
            identifier: args.identifier.clone(),
            version: args.version.clone(),
            icon: resolve_optional_path(args.icon.as_deref())?,
        },
    )?;

    fs::create_dir_all(&args.out).map_err(|source| PackagerError::CreateDir {
        path: args.out.clone(),
        source,
    })?;
    let out_dir = canonicalize_or_original(&args.out)?;

    let temp_root = tempdir().map_err(|source| PackagerError::CreateDir {
        path: std::env::temp_dir(),
        source,
    })?;
    let extract_dir = temp_root.path().join("export");
    extract_zip(&args.input, &extract_dir)?;
    let export_root = locate_export_root(&extract_dir)?;
    ensure_export_root(&export_root)?;

    let workspace_root = if args.keep_temp {
        temp_root.keep()
    } else {
        temp_root.path().to_path_buf()
    };

    let outcome = tauri::build(TauriBuildRequest {
        workspace_root,
        export_root,
        out_dir,
        metadata,
        targets,
        keep_temp: args.keep_temp,
        verbose: args.verbose,
    })?;

    print_summary(&outcome);

    Ok(())
}

fn load_config(path: Option<&Path>) -> Result<Option<PackagerConfig>> {
    path.map(PackagerConfig::load).transpose()
}

fn canonicalize_or_original(path: &Path) -> Result<PathBuf> {
    match fs::canonicalize(path) {
        Ok(path) => Ok(path),
        Err(_) => Ok(path.to_path_buf()),
    }
}

fn resolve_optional_path(path: Option<&Path>) -> Result<Option<PathBuf>> {
    path.map(|path| {
        fs::canonicalize(path).map_err(|source| PackagerError::Canonicalize {
            path: path.to_path_buf(),
            source,
        })
    })
    .transpose()
}

fn print_summary(outcome: &tauri::TauriBuildOutcome) {
    println!("Build succeeded.");
    println!(
        "Generated override config: {}",
        outcome.override_config_path.display()
    );
    println!("Artifacts:");
    for artifact in &outcome.artifacts {
        println!(
            "  - [{}] {}",
            artifact.target,
            artifact.output_path.display()
        );
    }

    if let Some(temp_root) = &outcome.temp_root {
        println!("Temporary workspace kept at: {}", temp_root.display());
    }
}

#[cfg(test)]
mod tests {
    use crate::payload::{parse_payload_key_hex, parse_payload_nonce_hex};

    #[test]
    fn parses_cli_key_and_nonce_hex() {
        let key = parse_payload_key_hex(
            "4242424242424242424242424242424242424242424242424242424242424242",
        )
        .unwrap();
        let nonce =
            parse_payload_nonce_hex("242424242424242424242424242424242424242424242424").unwrap();
        assert_eq!(key.0, [0x42; 32]);
        assert_eq!(nonce.0, [0x24; 24]);
    }

    #[test]
    fn rejects_wrong_hex_length() {
        let error = parse_payload_key_hex("000102").unwrap_err();
        assert!(error.to_string().contains("expected 32 bytes"));
    }
}
