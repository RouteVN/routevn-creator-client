//! iOS export. Fills in the bundled player template, compiles its icon with
//! Xcode's `actool`, wraps it in an Xcode archive, and has Xcode sign it with
//! the creator's Apple team: an App Store build, optionally uploaded to App
//! Store Connect, or a development build installed on a connected device.
//! Runs only on macOS with Xcode.

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

/// A failure as the frontend receives it: a stable `code` it can explain,
/// and the details. `ipaSaved` is true when only the upload failed, after the
/// IPA was saved.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IosExportError {
    pub code: &'static str,
    pub message: String,
    pub ipa_saved: bool,
}

impl IosExportError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            ipa_saved: false,
        }
    }

    fn failed(message: impl Into<String>) -> Self {
        Self::new("export-failed", message)
    }
}

/// Whether this Mac can sign iOS builds. `status` is `ready`,
/// `notInstalled`, `outdated`, `needsSetup` (Xcode has not finished its
/// first launch or its license is not accepted), `iosPlatformMissing`, or
/// `unsupportedHost`.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct XcodeStatus {
    pub status: &'static str,
    pub version: Option<String>,
    pub minimum_version: String,
}

/// A team of an Apple account signed in to Xcode.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppleTeam {
    pub id: String,
    pub name: String,
    pub kind: String,
    /// A free Personal Team: development builds only.
    pub free: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IosExportRequirements {
    pub xcode: XcodeStatus,
    pub teams: Vec<AppleTeam>,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum IosDistribution {
    AppStore,
    Development,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum IosOrientation {
    Landscape,
    Portrait,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IosExportRequest {
    pub template_path: PathBuf,
    /// Where to save the IPA. Absent when the build only installs on a
    /// device.
    #[serde(default)]
    pub output_path: Option<PathBuf>,
    /// Development builds only: install the app on this device from a
    /// temporary folder instead of saving the IPA.
    #[serde(default)]
    pub install_device_id: Option<String>,
    pub assets: Vec<routevn_exporter::ZipAssetInput>,
    pub instructions_json: String,
    pub application_name: String,
    pub bundle_identifier: String,
    pub version: String,
    pub build_number: String,
    pub orientation: IosOrientation,
    pub icon_path: PathBuf,
    pub team_id: String,
    pub distribution: IosDistribution,
    /// App Store builds only: also upload the build to App Store Connect.
    #[serde(default)]
    pub upload: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IosExportResult {
    pub output_path: Option<PathBuf>,
    pub ipa_bytes: u64,
    pub uploaded: bool,
    pub installed: bool,
    /// False when the app installed but did not open, such as on a locked
    /// device.
    pub launched: bool,
    pub package_bin_bytes: u64,
    pub encrypted_payload_bytes: u64,
    pub stats: routevn_exporter::PackageBinExportStats,
}

/// A physical iPhone or iPad known to this Mac.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IosDevice {
    pub id: String,
    pub name: String,
    pub model: String,
    pub os_version: String,
    /// Connected and paired, so it can install apps now.
    pub available: bool,
}

pub const MINIMUM_XCODE_MAJOR: u32 = 26;

async fn run_blocking<T: Send + 'static>(
    task: impl FnOnce() -> Result<T, IosExportError> + Send + 'static,
) -> Result<T, IosExportError> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| IosExportError::failed(format!("Failed to run the iOS task: {error}")))?
}

/// The Xcode status and the teams signed in to Xcode. Slow (it runs Xcode's
/// tools), so the frontend asks when the creator starts an export.
#[tauri::command]
pub async fn get_ios_export_requirements() -> IosExportRequirements {
    tauri::async_runtime::spawn_blocking(imp::requirements)
        .await
        .unwrap_or_else(|_| IosExportRequirements {
            xcode: XcodeStatus {
                status: "notInstalled",
                version: None,
                minimum_version: format!("{MINIMUM_XCODE_MAJOR}.0"),
            },
            teams: Vec::new(),
        })
}

#[tauri::command]
pub async fn export_ios_application(
    request: IosExportRequest,
    on_progress: Channel<routevn_exporter::ZipExportProgress>,
) -> Result<IosExportResult, IosExportError> {
    run_blocking(move || {
        let export_started = Instant::now();
        let progress_state = Mutex::new((String::new(), Instant::now()));
        let progress_callback = |mut progress: routevn_exporter::ZipExportProgress| {
            let now = Instant::now();
            progress.elapsed_ms =
                u64::try_from(export_started.elapsed().as_millis()).unwrap_or(u64::MAX);
            let Ok(mut state) = progress_state.lock() else {
                return;
            };
            let phase_changed = state.0 != progress.phase;
            let phase_complete = progress.total > 0 && progress.current == progress.total;
            let interval_elapsed = now.duration_since(state.1) >= Duration::from_millis(150);
            if !phase_changed && !phase_complete && !interval_elapsed {
                return;
            }
            state.0.clone_from(&progress.phase);
            state.1 = now;
            drop(state);
            let _ = on_progress.send(progress);
        };
        imp::export(request, Some(&progress_callback))
    })
    .await
}

#[tauri::command]
pub async fn list_ios_devices() -> Result<Vec<IosDevice>, IosExportError> {
    run_blocking(imp::list_devices).await
}

fn validate_request(request: &IosExportRequest) -> Result<(), IosExportError> {
    let invalid = |message: &str| Err(IosExportError::new("invalid-request", message));
    if request.application_name.trim().is_empty() {
        return invalid("An application name is required for iOS export.");
    }
    if !is_valid_bundle_identifier(&request.bundle_identifier) {
        return invalid("The iOS bundle identifier is invalid.");
    }
    if !is_valid_version(&request.version) {
        return invalid("The iOS version must contain three numeric components.");
    }
    if !is_valid_build_number(&request.build_number) {
        return invalid("The iOS build number must be a positive integer.");
    }
    if !is_valid_team_id(&request.team_id) {
        return invalid("Choose the Apple team that signs the app.");
    }
    if request.upload && request.distribution != IosDistribution::AppStore {
        return invalid("Only App Store builds can be uploaded.");
    }
    match (&request.output_path, &request.install_device_id) {
        (Some(path), None) => {
            if path.extension().and_then(|value| value.to_str()) != Some("ipa") {
                return invalid("The iOS export path must end in .ipa.");
            }
        }
        (None, Some(device_id)) => {
            if request.distribution != IosDistribution::Development {
                return invalid("Only development builds can be installed on a device.");
            }
            if device_id.trim().is_empty() {
                return invalid("Choose the device to install on.");
            }
        }
        _ => return invalid("Save the IPA or install it on a device."),
    }
    Ok(())
}

/// Reverse-DNS: at least two segments of ASCII letters, digits, and hyphens.
/// Apple refuses underscores.
pub fn is_valid_bundle_identifier(value: &str) -> bool {
    value.len() <= 155
        && value.split('.').count() > 1
        && value.split('.').all(|segment| {
            !segment.is_empty()
                && segment
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        })
}

fn is_valid_version(value: &str) -> bool {
    let components = value.split('.').collect::<Vec<_>>();
    components.len() == 3
        && components.iter().all(|component| {
            !component.is_empty()
                && component.len() <= 9
                && component.bytes().all(|byte| byte.is_ascii_digit())
                && (*component == "0" || !component.starts_with('0'))
        })
}

fn is_valid_build_number(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 9
        && value.bytes().all(|byte| byte.is_ascii_digit())
        && !value.starts_with('0')
}

fn is_valid_team_id(value: &str) -> bool {
    value.len() == 10
        && value
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit())
}

/// Turns Xcode's export output into a code the frontend can explain.
pub fn classify_xcodebuild_failure(output: &str, uploading: bool) -> &'static str {
    let lower = output.to_lowercase();
    if lower.contains("no account for team") || lower.contains("no accounts") {
        "team-not-signed-in"
    } else if lower.contains("does not have permission to create") {
        "team-cannot-distribute"
    } else if lower.contains("app record with bundle identifier")
        || lower.contains("no suitable application records")
    {
        "app-record-missing"
    } else if lower.contains("agreement") || lower.contains("pla update") {
        "agreement-required"
    } else if lower.contains("bundle version must be higher")
        || lower.contains("redundant binary upload")
        || lower.contains("has already been used")
    {
        "build-number-used"
    } else if lower.contains("train version") && lower.contains("closed") {
        "version-closed"
    } else if uploading {
        "upload-failed"
    } else {
        "signing-failed"
    }
}

/// The error lines of Xcode's output, without its log bundle noise.
fn xcodebuild_details(output: &str) -> String {
    let lines: Vec<&str> = output
        .lines()
        .map(str::trim_end)
        .filter(|line| !line.trim().is_empty() && !line.contains("IDEDistribution"))
        .collect();
    let start = lines
        .iter()
        .position(|line| line.starts_with("error:"))
        .unwrap_or_else(|| lines.len().saturating_sub(12));
    lines[start..].join("\n")
}

/// Parses the teams Xcode keeps for its signed-in accounts. The key is not
/// documented, so a missing or different shape gives no teams.
pub fn parse_xcode_teams(preferences: &plist::Value) -> Vec<AppleTeam> {
    let mut teams: Vec<AppleTeam> = Vec::new();
    let Some(preferences) = preferences.as_dictionary() else {
        return teams;
    };
    for key in ["IDEProvisioningTeamByIdentifier", "IDEProvisioningTeams"] {
        let Some(accounts) = preferences.get(key).and_then(plist::Value::as_dictionary) else {
            continue;
        };
        for account_teams in accounts.values().filter_map(plist::Value::as_array) {
            for team in account_teams.iter().filter_map(plist::Value::as_dictionary) {
                let text = |name: &str| {
                    team.get(name)
                        .and_then(plist::Value::as_string)
                        .unwrap_or_default()
                        .to_string()
                };
                let id = text("teamID");
                if !is_valid_team_id(&id) || teams.iter().any(|known| known.id == id) {
                    continue;
                }
                teams.push(AppleTeam {
                    name: text("teamName"),
                    kind: text("teamType"),
                    free: team
                        .get("isFreeProvisioningTeam")
                        .and_then(plist::Value::as_boolean)
                        .unwrap_or(false),
                    id,
                });
            }
        }
    }
    teams.sort_by(|a, b| a.free.cmp(&b.free).then_with(|| a.name.cmp(&b.name)));
    teams
}

/// The orientations the app supports on iPhone and on iPad.
fn orientations(orientation: IosOrientation) -> (Vec<&'static str>, Vec<&'static str>) {
    match orientation {
        IosOrientation::Landscape => (
            vec![
                "UIInterfaceOrientationLandscapeLeft",
                "UIInterfaceOrientationLandscapeRight",
            ],
            vec![
                "UIInterfaceOrientationLandscapeLeft",
                "UIInterfaceOrientationLandscapeRight",
            ],
        ),
        IosOrientation::Portrait => (
            vec!["UIInterfaceOrientationPortrait"],
            vec![
                "UIInterfaceOrientationPortrait",
                "UIInterfaceOrientationPortraitUpsideDown",
            ],
        ),
    }
}

/// The App Store icon: 1024 px square and opaque. The image is cropped to its
/// centered square and transparent pixels are drawn over white.
pub fn render_app_icon(bytes: &[u8]) -> Result<Vec<u8>, String> {
    use image::codecs::png::PngEncoder;
    use image::imageops::{self, FilterType};
    use image::{ExtendedColorType, ImageEncoder, RgbImage};

    const SIZE: u32 = 1024;
    let source = image::load_from_memory(bytes)
        .map_err(|error| format!("The app icon cannot be read: {error}"))?
        .to_rgba8();
    let side = source.width().min(source.height());
    if side == 0 {
        return Err("The app icon is empty.".to_string());
    }
    let square = imageops::crop_imm(
        &source,
        (source.width() - side) / 2,
        (source.height() - side) / 2,
        side,
        side,
    )
    .to_image();
    let resized = imageops::resize(&square, SIZE, SIZE, FilterType::Lanczos3);
    let opaque = RgbImage::from_fn(SIZE, SIZE, |x, y| {
        let [red, green, blue, alpha] = resized.get_pixel(x, y).0;
        let over_white = |channel: u8| {
            let alpha = u32::from(alpha);
            ((u32::from(channel) * alpha + 255 * (255 - alpha) + 127) / 255) as u8
        };
        image::Rgb([over_white(red), over_white(green), over_white(blue)])
    });
    let mut png = Vec::new();
    PngEncoder::new(&mut png)
        .write_image(opaque.as_raw(), SIZE, SIZE, ExtendedColorType::Rgb8)
        .map_err(|error| format!("The app icon cannot be written: {error}"))?;
    Ok(png)
}

#[cfg(not(target_os = "macos"))]
mod imp {
    use super::*;

    pub fn requirements() -> IosExportRequirements {
        IosExportRequirements {
            xcode: XcodeStatus {
                status: "unsupportedHost",
                version: None,
                minimum_version: format!("{MINIMUM_XCODE_MAJOR}.0"),
            },
            teams: Vec::new(),
        }
    }

    fn unsupported() -> IosExportError {
        IosExportError::new("unsupported-host", "iOS export needs a Mac with Xcode.")
    }

    pub fn export(
        _request: IosExportRequest,
        _on_progress: Option<&routevn_exporter::ZipExportProgressCallback<'_>>,
    ) -> Result<IosExportResult, IosExportError> {
        Err(unsupported())
    }

    pub fn list_devices() -> Result<Vec<IosDevice>, IosExportError> {
        Err(unsupported())
    }
}

#[cfg(target_os = "macos")]
mod imp {
    use std::ffi::OsStr;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::{Command, Output};

    use super::*;

    const TEMPLATE_APP_NAME: &str = "RouteVNPlayerTemplate.app";
    const APP_NAME: &str = "RouteVNPlayer.app";
    const EXECUTABLE_NAME: &str = "RouteVNPlayer";
    const PACKAGE_RESOURCE_NAME: &str = "routevn-package.bin";
    const SCHEME_NAME: &str = "RouteVNPlayer";

    struct Xcode {
        developer_dir: PathBuf,
    }

    impl Xcode {
        fn command(&self, tool: &str) -> Command {
            let mut command = Command::new(self.developer_dir.join("usr/bin").join(tool));
            command.env("DEVELOPER_DIR", &self.developer_dir);
            command
        }

        fn xcrun(&self) -> Command {
            let mut command = Command::new("/usr/bin/xcrun");
            command.env("DEVELOPER_DIR", &self.developer_dir);
            command
        }
    }

    fn emit(on_progress: Option<&routevn_exporter::ZipExportProgressCallback<'_>>, phase: &str) {
        if let Some(on_progress) = on_progress {
            on_progress(routevn_exporter::ZipExportProgress {
                phase: phase.to_string(),
                current: 0,
                total: 0,
                elapsed_ms: 0,
            });
        }
    }

    fn output_text(output: &Output) -> String {
        format!(
            "{}\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        )
    }

    fn run(mut command: Command, action: &str) -> Result<Output, IosExportError> {
        let output = command
            .output()
            .map_err(|error| IosExportError::failed(format!("Failed to {action}: {error}")))?;
        if output.status.success() {
            Ok(output)
        } else {
            Err(IosExportError::failed(format!(
                "Failed to {action}:\n{}",
                output_text(&output).trim()
            )))
        }
    }

    fn io_error(action: &str) -> impl Fn(std::io::Error) -> IosExportError + '_ {
        move |error| IosExportError::failed(format!("Failed to {action}: {error}"))
    }

    // Xcode folders in order of preference: the selected one, the usual
    // location, then any Spotlight finds.
    fn developer_dir_candidates() -> Vec<PathBuf> {
        let mut candidates = Vec::new();
        if let Ok(output) = Command::new("/usr/bin/xcode-select").arg("-p").output()
            && output.status.success()
        {
            candidates.push(PathBuf::from(
                String::from_utf8_lossy(&output.stdout).trim(),
            ));
        }
        candidates.push(PathBuf::from("/Applications/Xcode.app/Contents/Developer"));
        if let Ok(output) = Command::new("/usr/bin/mdfind")
            .arg("kMDItemCFBundleIdentifier == 'com.apple.dt.Xcode'")
            .output()
        {
            for line in String::from_utf8_lossy(&output.stdout).lines() {
                candidates.push(Path::new(line.trim()).join("Contents/Developer"));
            }
        }
        let mut unique: Vec<PathBuf> = Vec::new();
        for candidate in candidates {
            // The Command Line Tools have no iOS SDK or actool.
            if candidate.join("usr/bin/xcodebuild").is_file()
                && candidate.ends_with("Contents/Developer")
                && !unique.contains(&candidate)
            {
                unique.push(candidate);
            }
        }
        unique
    }

    fn xcode_version(developer_dir: &Path) -> Option<(String, u32)> {
        let output = Command::new(developer_dir.join("usr/bin/xcodebuild"))
            .env("DEVELOPER_DIR", developer_dir)
            .arg("-version")
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        let version = text
            .lines()
            .next()?
            .strip_prefix("Xcode ")?
            .trim()
            .to_string();
        let major = version.split('.').next()?.parse().ok()?;
        Some((version, major))
    }

    fn check_xcode() -> (XcodeStatus, Option<Xcode>) {
        let minimum_version = format!("{MINIMUM_XCODE_MAJOR}.0");
        let status = |status: &'static str, version: Option<String>| XcodeStatus {
            status,
            version,
            minimum_version: minimum_version.clone(),
        };
        let candidates = developer_dir_candidates();
        if candidates.is_empty() {
            return (status("notInstalled", None), None);
        }
        // The first Xcode that is new enough, or else the newest one.
        let versions: Vec<(PathBuf, Option<(String, u32)>)> = candidates
            .into_iter()
            .map(|dir| {
                let version = xcode_version(&dir);
                (dir, version)
            })
            .collect();
        let chosen = versions
            .iter()
            .find(|(_, version)| {
                version
                    .as_ref()
                    .is_some_and(|(_, major)| *major >= MINIMUM_XCODE_MAJOR)
            })
            .or_else(|| {
                versions
                    .iter()
                    .max_by_key(|(_, version)| version.as_ref().map_or(0, |(_, major)| *major))
            });
        let Some((developer_dir, version)) = chosen else {
            return (status("notInstalled", None), None);
        };
        let Some((version, major)) = version.clone() else {
            // xcodebuild ran but did not report a version: the license is
            // not accepted or the first launch has not finished.
            return (status("needsSetup", None), None);
        };
        if major < MINIMUM_XCODE_MAJOR {
            return (status("outdated", Some(version)), None);
        }
        let xcode = Xcode {
            developer_dir: developer_dir.clone(),
        };
        let first_launch = xcode
            .command("xcodebuild")
            .arg("-checkFirstLaunchStatus")
            .output();
        if !first_launch.is_ok_and(|output| output.status.success()) {
            return (status("needsSetup", Some(version)), None);
        }
        let sdk = xcode
            .xcrun()
            .args(["--sdk", "iphoneos", "--show-sdk-path"])
            .output();
        let actool = xcode.xcrun().args(["--find", "actool"]).output();
        if !sdk.is_ok_and(|output| output.status.success())
            || !actool.is_ok_and(|output| output.status.success())
        {
            return (status("iosPlatformMissing", Some(version)), None);
        }
        (status("ready", Some(version)), Some(xcode))
    }

    fn signed_in_teams() -> Vec<AppleTeam> {
        let Ok(output) = Command::new("/usr/bin/defaults")
            .args(["export", "com.apple.dt.Xcode", "-"])
            .output()
        else {
            return Vec::new();
        };
        if !output.status.success() {
            return Vec::new();
        }
        plist::Value::from_reader(std::io::Cursor::new(output.stdout))
            .map(|preferences| parse_xcode_teams(&preferences))
            .unwrap_or_default()
    }

    pub fn requirements() -> IosExportRequirements {
        let (xcode, _) = check_xcode();
        IosExportRequirements {
            xcode,
            teams: signed_in_teams(),
        }
    }

    fn require_xcode() -> Result<Xcode, IosExportError> {
        match check_xcode() {
            (_, Some(xcode)) => Ok(xcode),
            (status, None) => Err(IosExportError::new(
                "xcode-unavailable",
                format!("Xcode is not ready for iOS export ({}).", status.status),
            )),
        }
    }

    pub fn export(
        mut request: IosExportRequest,
        on_progress: Option<&routevn_exporter::ZipExportProgressCallback<'_>>,
    ) -> Result<IosExportResult, IosExportError> {
        validate_request(&request)?;
        let assets = std::mem::take(&mut request.assets);
        let instructions_json = std::mem::take(&mut request.instructions_json);
        let request = &request;
        emit(on_progress, "prepareApplication");
        let xcode = require_xcode()?;
        if !request.template_path.is_file() {
            return Err(IosExportError::new(
                "template-invalid",
                format!(
                    "The iOS player template is missing: {}.",
                    request.template_path.display()
                ),
            ));
        }
        let icon = fs::read(&request.icon_path).map_err(io_error("read the app icon"))?;
        let icon = render_app_icon(&icon)
            .map_err(|message| IosExportError::new("invalid-request", message))?;

        let temp = tempfile::tempdir().map_err(io_error("create the iOS export workspace"))?;
        let archive_path = temp.path().join(format!("{SCHEME_NAME}.xcarchive"));
        let applications = archive_path.join("Products/Applications");
        fs::create_dir_all(&applications).map_err(io_error("create the Xcode archive"))?;
        let template_dir = temp.path().join("template");
        fs::create_dir_all(&template_dir).map_err(io_error("prepare the template folder"))?;
        let mut ditto = Command::new("/usr/bin/ditto");
        ditto
            .args(["-x", "-k", "--noqtn"])
            .arg(&request.template_path)
            .arg(&template_dir);
        run(ditto, "expand the iOS player template")?;
        let template_app = template_dir.join(TEMPLATE_APP_NAME);
        let app = applications.join(APP_NAME);
        if !template_app.join(EXECUTABLE_NAME).is_file()
            || template_app.join("_CodeSignature").exists()
            || template_app.join(PACKAGE_RESOURCE_NAME).exists()
        {
            return Err(IosExportError::new(
                "template-invalid",
                "The iOS player template is not an unsigned player app.",
            ));
        }
        fs::rename(&template_app, &app).map_err(io_error("move the player into the archive"))?;

        let package_bin = routevn_exporter::create_package_bin_with_progress(
            assets,
            instructions_json,
            on_progress,
        )
        .map_err(|error| {
            IosExportError::failed(format!("Failed to create the game package: {error}"))
        })?;
        let package_bin_bytes = package_bin.package_bin.len() as u64;
        emit(on_progress, "encryptPayload");
        let (key, nonce) = routevn_packager::payload::generate_payload_key_material();
        let payload = routevn_packager::payload::write_standalone_chunked_encrypted_payload(
            routevn_packager::payload::WriteStandaloneChunkedPayloadRequest {
                output_path: &app.join(PACKAGE_RESOURCE_NAME),
                payload: &package_bin.package_bin,
                key,
                nonce,
                chunk_size: routevn_packager::payload::DEFAULT_PAYLOAD_CHUNK_SIZE,
            },
        )
        .map_err(|error| {
            IosExportError::failed(format!("Failed to encrypt the game package: {error}"))
        })?;
        drop(package_bin.package_bin);

        emit(on_progress, "compileAssets");
        let minimum_os = stamp_info_plist(&app, request)?;
        compile_assets(&xcode, &app, &icon, &minimum_os, temp.path())?;
        write_archive_info(&archive_path, request)?;

        emit(on_progress, "signApplication");
        let export_dir = temp.path().join("export");
        export_archive(
            &xcode,
            &archive_path,
            &export_dir,
            request,
            false,
            temp.path(),
        )?;
        let ipa = find_ipa(&export_dir)?;
        let ipa_bytes = fs::metadata(&ipa).map_err(io_error("read the IPA"))?.len();

        // An install-only build is never saved: it installs from the
        // workspace, which is deleted when the export ends.
        let mut launched = false;
        if let Some(output_path) = &request.output_path {
            emit(on_progress, "saveApplication");
            save(&ipa, output_path)?;
        } else if let Some(device_id) = &request.install_device_id {
            emit(on_progress, "installApplication");
            launched = install(&xcode, &ipa, device_id, &request.bundle_identifier)?;
        }

        let mut uploaded = false;
        if request.upload {
            emit(on_progress, "uploadApplication");
            export_archive(
                &xcode,
                &archive_path,
                &temp.path().join("upload"),
                request,
                true,
                temp.path(),
            )
            .map_err(|mut error| {
                error.ipa_saved = true;
                error
            })?;
            uploaded = true;
        }

        Ok(IosExportResult {
            output_path: request.output_path.clone(),
            ipa_bytes,
            uploaded,
            installed: request.install_device_id.is_some(),
            launched,
            package_bin_bytes,
            encrypted_payload_bytes: payload.footer.encrypted_len,
            stats: package_bin.stats,
        })
    }

    // Writes the game's identity into the player's Info.plist and returns its
    // minimum iOS version.
    fn stamp_info_plist(app: &Path, request: &IosExportRequest) -> Result<String, IosExportError> {
        let path = app.join("Info.plist");
        let mut info = plist::Value::from_file(&path).map_err(|error| {
            IosExportError::new(
                "template-invalid",
                format!("Failed to read the player Info.plist: {error}"),
            )
        })?;
        let dictionary = info.as_dictionary_mut().ok_or_else(|| {
            IosExportError::new(
                "template-invalid",
                "The player Info.plist is not a dictionary.",
            )
        })?;
        let minimum_os = dictionary
            .get("MinimumOSVersion")
            .and_then(plist::Value::as_string)
            .unwrap_or("16.0")
            .to_string();
        let text = |value: &str| plist::Value::String(value.to_string());
        dictionary.insert(
            "CFBundleIdentifier".into(),
            text(&request.bundle_identifier),
        );
        dictionary.insert(
            "CFBundleDisplayName".into(),
            text(request.application_name.trim()),
        );
        dictionary.insert("CFBundleShortVersionString".into(), text(&request.version));
        dictionary.insert("CFBundleVersion".into(), text(&request.build_number));
        let (iphone, ipad) = orientations(request.orientation);
        let list = |values: Vec<&str>| plist::Value::Array(values.into_iter().map(text).collect());
        dictionary.insert("UISupportedInterfaceOrientations".into(), list(iphone));
        dictionary.insert("UISupportedInterfaceOrientations~ipad".into(), list(ipad));
        info.to_file_xml(&path).map_err(|error| {
            IosExportError::failed(format!("Failed to write the player Info.plist: {error}"))
        })?;
        Ok(minimum_os)
    }

    // Replaces the template's compiled asset catalog with one holding the
    // game's icon and the black launch screen color.
    fn compile_assets(
        xcode: &Xcode,
        app: &Path,
        icon_png: &[u8],
        minimum_os: &str,
        temp: &Path,
    ) -> Result<(), IosExportError> {
        let write = |path: PathBuf, contents: &[u8]| -> Result<(), IosExportError> {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).map_err(io_error("create the asset catalog"))?;
            }
            fs::write(&path, contents).map_err(io_error("write the asset catalog"))
        };
        let catalog = temp.join("Assets.xcassets");
        let info = br#"{ "info" : { "author" : "xcode", "version" : 1 } }"#;
        write(catalog.join("Contents.json"), info)?;
        write(catalog.join("AppIcon.appiconset/AppIcon.png"), icon_png)?;
        write(
            catalog.join("AppIcon.appiconset/Contents.json"),
            br#"{ "images" : [ { "filename" : "AppIcon.png", "idiom" : "universal", "platform" : "ios", "size" : "1024x1024" } ], "info" : { "author" : "xcode", "version" : 1 } }"#,
        )?;
        write(
            catalog.join("LaunchBackground.colorset/Contents.json"),
            br#"{ "colors" : [ { "color" : { "color-space" : "srgb", "components" : { "alpha" : "1.000", "blue" : "0x00", "green" : "0x00", "red" : "0x00" } }, "idiom" : "universal" } ], "info" : { "author" : "xcode", "version" : 1 } }"#,
        )?;
        for entry in fs::read_dir(app).map_err(io_error("read the player app"))? {
            let path = entry.map_err(io_error("read the player app"))?.path();
            let name = path.file_name().and_then(OsStr::to_str).unwrap_or_default();
            if name == "Assets.car" || (name.starts_with("AppIcon") && name.ends_with(".png")) {
                fs::remove_file(&path).map_err(io_error("remove the template icons"))?;
            }
        }
        let partial = temp.join("assets-info.plist");
        let mut actool = xcode.xcrun();
        actool
            .arg("actool")
            .arg(&catalog)
            .arg("--compile")
            .arg(app)
            .args([
                "--platform",
                "iphoneos",
                "--minimum-deployment-target",
                minimum_os,
            ])
            .args([
                "--app-icon",
                "AppIcon",
                "--target-device",
                "iphone",
                "--target-device",
                "ipad",
            ])
            .arg("--output-partial-info-plist")
            .arg(&partial)
            .args(["--output-format", "human-readable-text"]);
        run(actool, "compile the app icon")?;
        if !app.join("Assets.car").is_file() {
            return Err(IosExportError::failed(
                "Xcode did not compile the app icon.",
            ));
        }
        let partial = plist::Value::from_file(&partial).map_err(|error| {
            IosExportError::failed(format!("Failed to read the compiled icon keys: {error}"))
        })?;
        let info_path = app.join("Info.plist");
        let mut info = plist::Value::from_file(&info_path).map_err(|error| {
            IosExportError::failed(format!("Failed to read the player Info.plist: {error}"))
        })?;
        if let (Some(info), Some(partial)) = (info.as_dictionary_mut(), partial.as_dictionary()) {
            for (key, value) in partial {
                info.insert(key.clone(), value.clone());
            }
        }
        info.to_file_xml(&info_path).map_err(|error| {
            IosExportError::failed(format!("Failed to write the player Info.plist: {error}"))
        })
    }

    fn write_archive_info(
        archive: &Path,
        request: &IosExportRequest,
    ) -> Result<(), IosExportError> {
        let text = |value: &str| plist::Value::String(value.to_string());
        let mut properties = plist::Dictionary::new();
        properties.insert(
            "ApplicationPath".into(),
            text(&format!("Applications/{APP_NAME}")),
        );
        properties.insert(
            "Architectures".into(),
            plist::Value::Array(vec![text("arm64")]),
        );
        properties.insert(
            "CFBundleIdentifier".into(),
            text(&request.bundle_identifier),
        );
        properties.insert("CFBundleShortVersionString".into(), text(&request.version));
        properties.insert("CFBundleVersion".into(), text(&request.build_number));
        properties.insert("Team".into(), text(&request.team_id));
        let mut info = plist::Dictionary::new();
        info.insert(
            "ApplicationProperties".into(),
            plist::Value::Dictionary(properties),
        );
        info.insert("ArchiveVersion".into(), plist::Value::Integer(2.into()));
        // Whole seconds: Xcode calls an archive with fractional seconds in its
        // date malformed.
        let seconds = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |elapsed| elapsed.as_secs());
        let created = std::time::UNIX_EPOCH + std::time::Duration::from_secs(seconds);
        info.insert("CreationDate".into(), plist::Value::Date(created.into()));
        info.insert("Name".into(), text(SCHEME_NAME));
        info.insert("SchemeName".into(), text(SCHEME_NAME));
        plist::Value::Dictionary(info)
            .to_file_xml(archive.join("Info.plist"))
            .map_err(|error| {
                IosExportError::failed(format!("Failed to write the Xcode archive: {error}"))
            })
    }

    // Has Xcode sign the archive with the team, creating certificates and
    // profiles as needed, and either export the IPA or upload it.
    fn export_archive(
        xcode: &Xcode,
        archive: &Path,
        export_dir: &Path,
        request: &IosExportRequest,
        upload: bool,
        temp: &Path,
    ) -> Result<(), IosExportError> {
        let text = |value: &str| plist::Value::String(value.to_string());
        let mut options = plist::Dictionary::new();
        let method = match request.distribution {
            IosDistribution::AppStore => "app-store-connect",
            IosDistribution::Development => "debugging",
        };
        options.insert("method".into(), text(method));
        options.insert("signingStyle".into(), text("automatic"));
        options.insert("teamID".into(), text(&request.team_id));
        if request.distribution == IosDistribution::AppStore {
            options.insert(
                "destination".into(),
                text(if upload { "upload" } else { "export" }),
            );
            // The template has no symbols, and the creator chose the build
            // number.
            options.insert("uploadSymbols".into(), plist::Value::Boolean(false));
            options.insert(
                "manageAppVersionAndBuildNumber".into(),
                plist::Value::Boolean(false),
            );
        }
        let options_path = temp.join(if upload {
            "upload-options.plist"
        } else {
            "export-options.plist"
        });
        plist::Value::Dictionary(options)
            .to_file_xml(&options_path)
            .map_err(|error| {
                IosExportError::failed(format!("Failed to write the export options: {error}"))
            })?;
        let output = xcode
            .command("xcodebuild")
            .arg("-exportArchive")
            .arg("-archivePath")
            .arg(archive)
            .arg("-exportPath")
            .arg(export_dir)
            .arg("-exportOptionsPlist")
            .arg(&options_path)
            .arg("-allowProvisioningUpdates")
            .output()
            .map_err(io_error("run Xcode"))?;
        if output.status.success() {
            return Ok(());
        }
        let text = output_text(&output);
        Err(IosExportError::new(
            classify_xcodebuild_failure(&text, upload),
            xcodebuild_details(&text),
        ))
    }

    fn find_ipa(export_dir: &Path) -> Result<PathBuf, IosExportError> {
        fs::read_dir(export_dir)
            .map_err(io_error("read the Xcode export"))?
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .find(|path| path.extension().and_then(OsStr::to_str) == Some("ipa"))
            .ok_or_else(|| IosExportError::failed("Xcode did not export an IPA."))
    }

    // Copies the IPA next to the destination, then renames it into place.
    fn save(ipa: &Path, destination: &Path) -> Result<u64, IosExportError> {
        let parent = destination
            .parent()
            .ok_or_else(|| IosExportError::failed("The iOS export folder is required."))?;
        fs::create_dir_all(parent).map_err(io_error("create the export folder"))?;
        let mut part = destination.as_os_str().to_os_string();
        part.push(".part");
        let part = PathBuf::from(part);
        let bytes = fs::copy(ipa, &part).map_err(io_error("save the IPA"))?;
        fs::rename(&part, destination).map_err(|error| {
            let _ = fs::remove_file(&part);
            IosExportError::failed(format!("Failed to save the IPA: {error}"))
        })?;
        Ok(bytes)
    }

    pub fn list_devices() -> Result<Vec<IosDevice>, IosExportError> {
        let xcode = require_xcode()?;
        let temp = tempfile::tempdir().map_err(io_error("create a temporary folder"))?;
        let json_path = temp.path().join("devices.json");
        let mut devicectl = xcode.xcrun();
        devicectl
            .args(["devicectl", "list", "devices", "--quiet", "--json-output"])
            .arg(&json_path);
        run(devicectl, "list devices")?;
        let json = fs::read(&json_path).map_err(io_error("read the device list"))?;
        Ok(parse_devices(&json))
    }

    // Installs the IPA and opens the app. Returns whether it opened: a locked
    // device installs the app but does not open it.
    fn install(
        xcode: &Xcode,
        ipa_path: &Path,
        device_id: &str,
        bundle_identifier: &str,
    ) -> Result<bool, IosExportError> {
        let output = xcode
            .xcrun()
            .args([
                "devicectl",
                "device",
                "install",
                "app",
                "--device",
                device_id,
            ])
            .arg(ipa_path)
            .output()
            .map_err(io_error("run devicectl"))?;
        if !output.status.success() {
            let text = output_text(&output);
            let lower = text.to_lowercase();
            let code = if lower.contains("provisioning profile") || lower.contains("not registered")
            {
                "device-not-registered"
            } else if lower.contains("not connected")
                || lower.contains("unavailable")
                || lower.contains("not found")
            {
                "device-unavailable"
            } else {
                "install-failed"
            };
            return Err(IosExportError::new(code, xcodebuild_details(&text)));
        }
        let launched = xcode
            .xcrun()
            .args([
                "devicectl",
                "device",
                "process",
                "launch",
                "--device",
                device_id,
                bundle_identifier,
            ])
            .output()
            .is_ok_and(|output| output.status.success());
        Ok(launched)
    }
}

/// Reads `devicectl list devices --json-output`: physical iPhones and iPads.
pub fn parse_devices(json: &[u8]) -> Vec<IosDevice> {
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(json) else {
        return Vec::new();
    };
    let Some(devices) = value
        .pointer("/result/devices")
        .and_then(|value| value.as_array())
    else {
        return Vec::new();
    };
    let text = |device: &serde_json::Value, pointer: &str| {
        device
            .pointer(pointer)
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string()
    };
    devices
        .iter()
        .filter(|device| {
            text(device, "/hardwareProperties/platform") == "iOS"
                && text(device, "/hardwareProperties/reality") == "physical"
        })
        .filter_map(|device| {
            let id = text(device, "/hardwareProperties/udid");
            if id.is_empty() {
                return None;
            }
            let paired = text(device, "/connectionProperties/pairingState") == "paired";
            let tunnel = text(device, "/connectionProperties/tunnelState");
            Some(IosDevice {
                id,
                name: text(device, "/deviceProperties/name"),
                model: text(device, "/hardwareProperties/marketingName"),
                os_version: text(device, "/deviceProperties/osVersionNumber"),
                available: paired && tunnel != "unavailable",
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> IosExportRequest {
        IosExportRequest {
            template_path: PathBuf::from("template.app.zip"),
            output_path: Some(PathBuf::from("/tmp/Game.ipa")),
            install_device_id: None,
            assets: Vec::new(),
            instructions_json: "{}".into(),
            application_name: "Project One".into(),
            bundle_identifier: "com.example.project-one".into(),
            version: "1.2.3".into(),
            build_number: "7".into(),
            orientation: IosOrientation::Landscape,
            icon_path: PathBuf::from("icon.png"),
            team_id: "ABCDE12345".into(),
            distribution: IosDistribution::AppStore,
            upload: true,
        }
    }

    #[test]
    fn validates_the_request() {
        assert!(validate_request(&request()).is_ok());
        let check = |change: fn(&mut IosExportRequest)| {
            let mut request = request();
            change(&mut request);
            validate_request(&request).unwrap_err().code
        };
        assert_eq!(
            check(|r| r.application_name = " ".into()),
            "invalid-request"
        );
        assert_eq!(
            check(|r| r.bundle_identifier = "com.example_game".into()),
            "invalid-request"
        );
        assert_eq!(
            check(|r| r.bundle_identifier = "game".into()),
            "invalid-request"
        );
        assert_eq!(check(|r| r.version = "1.2".into()), "invalid-request");
        assert_eq!(check(|r| r.version = "1.02.3".into()), "invalid-request");
        assert_eq!(check(|r| r.build_number = "0".into()), "invalid-request");
        assert_eq!(check(|r| r.build_number = "1.2".into()), "invalid-request");
        assert_eq!(
            check(|r| r.team_id = "abcde12345".into()),
            "invalid-request"
        );
        assert_eq!(check(|r| r.team_id = String::new()), "invalid-request");
        assert_eq!(
            check(|r| r.distribution = IosDistribution::Development),
            "invalid-request"
        );
        assert_eq!(
            check(|r| r.output_path = Some(PathBuf::from("/tmp/Game.zip"))),
            "invalid-request"
        );
        assert_eq!(check(|r| r.output_path = None), "invalid-request");

        let install = |r: &mut IosExportRequest| {
            r.distribution = IosDistribution::Development;
            r.upload = false;
            r.output_path = None;
            r.install_device_id = Some("device-1".into());
        };
        let mut installing = request();
        install(&mut installing);
        assert!(validate_request(&installing).is_ok());
        assert_eq!(
            check(|r| {
                r.output_path = None;
                r.upload = false;
                r.install_device_id = Some("device-1".into());
            }),
            "invalid-request"
        );
        assert_eq!(
            check(|r| {
                r.distribution = IosDistribution::Development;
                r.upload = false;
                r.install_device_id = Some("device-1".into());
            }),
            "invalid-request"
        );
    }

    #[test]
    fn classifies_xcode_failures() {
        let cases = [
            (
                "error: exportArchive No Account for Team \"ABCDE12345\".",
                false,
                "team-not-signed-in",
            ),
            (
                "error: exportArchive Team \"Someone\" does not have permission to create \"iOS App Store\" provisioning profiles.",
                false,
                "team-cannot-distribute",
            ),
            (
                "error: exportArchive Error Downloading App Information\n  App record with bundle identifier \"com.example.game\" not found on App Store Connect.",
                true,
                "app-record-missing",
            ),
            (
                "Unable to process request - PLA Update available",
                true,
                "agreement-required",
            ),
            (
                "The bundle version must be higher than the previously uploaded version.",
                true,
                "build-number-used",
            ),
            (
                "The train version '1.0.0' is closed for new build submissions",
                true,
                "version-closed",
            ),
            ("error: exportArchive Something else", true, "upload-failed"),
            (
                "error: exportArchive Something else",
                false,
                "signing-failed",
            ),
        ];
        for (output, uploading, code) in cases {
            assert_eq!(
                classify_xcodebuild_failure(output, uploading),
                code,
                "{output}"
            );
        }
    }

    #[test]
    fn keeps_the_error_lines_of_xcode_output() {
        let output = "2026-11-13 xcodebuild[1:2] [MT] IDEDistribution: log bundle\n\nerror: exportArchive No Account for Team \"X\".\n  Add a new account.\n** EXPORT FAILED **\n";
        assert_eq!(
            xcodebuild_details(output),
            "error: exportArchive No Account for Team \"X\".\n  Add a new account.\n** EXPORT FAILED **"
        );
    }

    #[test]
    fn reads_signed_in_teams() {
        let preferences = plist::Value::from_reader_xml(
            br#"<?xml version="1.0" encoding="UTF-8"?>
            <plist version="1.0"><dict>
              <key>IDEProvisioningTeamByIdentifier</key>
              <dict>
                <key>account-1</key>
                <array>
                  <dict>
                    <key>teamID</key><string>PERSONAL12</string>
                    <key>teamName</key><string>A Person</string>
                    <key>teamType</key><string>Personal Team</string>
                    <key>isFreeProvisioningTeam</key><true/>
                  </dict>
                  <dict>
                    <key>teamID</key><string>COMPANY123</string>
                    <key>teamName</key><string>Studio One</string>
                    <key>teamType</key><string>Company</string>
                    <key>isFreeProvisioningTeam</key><false/>
                  </dict>
                </array>
                <key>account-2</key>
                <array>
                  <dict>
                    <key>teamID</key><string>COMPANY123</string>
                    <key>teamName</key><string>Studio One</string>
                  </dict>
                  <dict><key>teamID</key><string>bad</string></dict>
                </array>
              </dict>
            </dict></plist>"#
                .as_slice(),
        )
        .unwrap();
        assert_eq!(
            parse_xcode_teams(&preferences),
            vec![
                AppleTeam {
                    id: "COMPANY123".into(),
                    name: "Studio One".into(),
                    kind: "Company".into(),
                    free: false,
                },
                AppleTeam {
                    id: "PERSONAL12".into(),
                    name: "A Person".into(),
                    kind: "Personal Team".into(),
                    free: true,
                },
            ]
        );
        assert!(parse_xcode_teams(&plist::Value::Boolean(true)).is_empty());
    }

    #[test]
    fn renders_an_opaque_square_icon() {
        use image::{ImageEncoder, codecs::png::PngEncoder};
        // A 4x2 image: transparent on the left, opaque red on the right.
        let mut rgba = Vec::new();
        for _ in 0..2 {
            rgba.extend_from_slice(&[0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255]);
        }
        let mut png = Vec::new();
        PngEncoder::new(&mut png)
            .write_image(&rgba, 4, 2, image::ExtendedColorType::Rgba8)
            .unwrap();
        let icon = image::load_from_memory(&render_app_icon(&png).unwrap()).unwrap();
        assert_eq!((icon.width(), icon.height()), (1024, 1024));
        assert!(!icon.color().has_alpha());
        let icon = icon.to_rgb8();
        // The centered square holds one transparent column and one red one.
        assert_eq!(icon.get_pixel(100, 512).0, [255, 255, 255]);
        assert_eq!(icon.get_pixel(923, 512).0, [255, 0, 0]);
        assert!(render_app_icon(b"not an image").is_err());
    }

    #[test]
    fn reads_physical_devices() {
        let json = br#"{ "result": { "devices": [
          { "hardwareProperties": { "platform": "iOS", "reality": "physical", "udid": "00008110-0001", "marketingName": "iPad mini (6th generation)" },
            "deviceProperties": { "name": "iPad", "osVersionNumber": "27.0.1" },
            "connectionProperties": { "pairingState": "paired", "tunnelState": "connected" } },
          { "hardwareProperties": { "platform": "iOS", "reality": "physical", "udid": "00008150-0002", "marketingName": "iPhone 17 Pro Max" },
            "deviceProperties": { "name": "iPhone", "osVersionNumber": "27.0" },
            "connectionProperties": { "pairingState": "paired", "tunnelState": "unavailable" } },
          { "hardwareProperties": { "platform": "iOS", "reality": "simulated", "udid": "SIM" },
            "deviceProperties": { "name": "Simulator" }, "connectionProperties": {} },
          { "hardwareProperties": { "platform": "macOS", "reality": "physical", "udid": "MAC" },
            "deviceProperties": { "name": "Mac" }, "connectionProperties": {} }
        ] } }"#;
        assert_eq!(
            parse_devices(json),
            vec![
                IosDevice {
                    id: "00008110-0001".into(),
                    name: "iPad".into(),
                    model: "iPad mini (6th generation)".into(),
                    os_version: "27.0.1".into(),
                    available: true,
                },
                IosDevice {
                    id: "00008150-0002".into(),
                    name: "iPhone".into(),
                    model: "iPhone 17 Pro Max".into(),
                    os_version: "27.0".into(),
                    available: false,
                },
            ]
        );
        assert!(parse_devices(b"{}").is_empty());
    }

    #[test]
    fn orients_the_app() {
        let (iphone, ipad) = orientations(IosOrientation::Portrait);
        assert_eq!(iphone, ["UIInterfaceOrientationPortrait"]);
        assert_eq!(ipad.len(), 2);
        let (iphone, ipad) = orientations(IosOrientation::Landscape);
        assert_eq!(iphone, ipad);
    }

    /// Exports a real game when ROUTEVN_IOS_EXPORT_TEST names a folder with
    /// `instructions.json` and `assets.json` (see the iOS export doc).
    #[test]
    #[ignore]
    fn exports_a_game() {
        let input = PathBuf::from(std::env::var("ROUTEVN_IOS_EXPORT_TEST").unwrap());
        let env = |name: &str| std::env::var(name).unwrap();
        let request = IosExportRequest {
            template_path: PathBuf::from(env("ROUTEVN_IOS_TEMPLATE")),
            output_path: std::env::var("ROUTEVN_IOS_OUTPUT").ok().map(PathBuf::from),
            install_device_id: std::env::var("ROUTEVN_IOS_DEVICE").ok(),
            assets: serde_json::from_slice(&std::fs::read(input.join("assets.json")).unwrap())
                .unwrap(),
            instructions_json: std::fs::read_to_string(input.join("instructions.json")).unwrap(),
            application_name: env("ROUTEVN_IOS_NAME"),
            bundle_identifier: env("ROUTEVN_IOS_BUNDLE_ID"),
            version: "1.0.0".into(),
            build_number: std::env::var("ROUTEVN_IOS_BUILD").unwrap_or_else(|_| "1".into()),
            orientation: IosOrientation::Landscape,
            icon_path: PathBuf::from(env("ROUTEVN_IOS_ICON")),
            team_id: env("ROUTEVN_IOS_TEAM"),
            distribution: if std::env::var("ROUTEVN_IOS_APP_STORE").is_ok() {
                IosDistribution::AppStore
            } else {
                IosDistribution::Development
            },
            upload: std::env::var("ROUTEVN_IOS_UPLOAD").is_ok(),
        };
        let result = imp::export(request, None).unwrap();
        println!("{}", serde_json::to_string(&result).unwrap());
    }
}
