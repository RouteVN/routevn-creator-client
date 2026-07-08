use std::io;
use std::path::PathBuf;
use std::process::ExitStatus;

use thiserror::Error;

use crate::targets::{DesktopTarget, HostPlatform};

pub type Result<T> = std::result::Result<T, PackagerError>;

#[derive(Debug, Error)]
pub enum PackagerError {
    #[error("failed to parse CLI arguments: {0}")]
    Clap(#[from] clap::Error),

    #[error("failed to read {path}: {source}")]
    ReadFile { path: PathBuf, source: io::Error },

    #[error("failed to write {path}: {source}")]
    WriteFile { path: PathBuf, source: io::Error },

    #[error("failed to create directory {path}: {source}")]
    CreateDir { path: PathBuf, source: io::Error },

    #[error("failed to canonicalize {path}: {source}")]
    Canonicalize { path: PathBuf, source: io::Error },

    #[error("failed to copy {from} to {to}: {source}")]
    Copy {
        from: PathBuf,
        to: PathBuf,
        source: io::Error,
    },

    #[error("failed to load config {path}: {message}")]
    ConfigParse { path: PathBuf, message: String },

    #[error("unsupported config format for {path}; use .json or .toml")]
    UnsupportedConfigFormat { path: PathBuf },

    #[error("invalid version `{version}`: {message}")]
    InvalidVersion { version: String, message: String },

    #[error(
        "invalid identifier `{identifier}`; expected reverse-DNS style segments with letters or digits"
    )]
    InvalidIdentifier { identifier: String },

    #[error("could not derive app metadata from {path}")]
    MissingZipStem { path: PathBuf },

    #[error(
        "no RouteVN export root containing index.html, main.js, and package.bin was found in {path}"
    )]
    ExportRootNotFound { path: PathBuf },

    #[error("multiple RouteVN export roots were found in {path}: {matches:?}")]
    AmbiguousExportRoot {
        path: PathBuf,
        matches: Vec<PathBuf>,
    },

    #[error("RouteVN export at {path} is missing required files: {missing:?}")]
    MissingRequiredFiles { path: PathBuf, missing: Vec<String> },

    #[error("failed to read zip archive {path}: {message}")]
    ZipOpen { path: PathBuf, message: String },

    #[error("failed to extract zip archive {path}: {message}")]
    ZipExtract { path: PathBuf, message: String },

    #[error("zip archive {path} contains an unsafe path: {entry}")]
    UnsafeZipPath { path: PathBuf, entry: String },

    #[error("target `{target}` is not supported on a {host} host")]
    UnsupportedTarget {
        target: DesktopTarget,
        host: HostPlatform,
    },

    #[error("the Tauri shell template was not found at {path}")]
    MissingTauriShell { path: PathBuf },

    #[error("missing system dependency `{dependency}`: {hint}")]
    MissingSystemDependency { dependency: String, hint: String },

    #[error(
        "Windows installer export is only supported on Windows hosts in v1; current host is {host}"
    )]
    UnsupportedInstallerHost { host: String },

    #[error("failed to spawn command `{program}`: {source}")]
    SpawnCommand { program: String, source: io::Error },

    #[error(
        "command `{program}` failed with status {status}: {stderr}",
        stderr = stderr.trim()
    )]
    CommandFailed {
        program: String,
        status: ExitStatus,
        stdout: String,
        stderr: String,
    },

    #[error("no build artifacts were produced in {path}")]
    NoArtifactsFound { path: PathBuf },

    #[error("invalid embedded payload in {path}: {message}")]
    InvalidEmbeddedPayload { path: PathBuf, message: String },

    #[error("invalid Windows executable resource in {path}: {message}")]
    InvalidWindowsResource { path: PathBuf, message: String },

    #[error("payload encryption failed: {message}")]
    PayloadCrypto { message: String },

    #[error("invalid {field}; expected {expected_bytes} bytes encoded as hex")]
    InvalidHexValue {
        field: String,
        expected_bytes: usize,
    },
}
