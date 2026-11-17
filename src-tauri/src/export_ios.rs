//! iOS export. Fills in the bundled player template, compiles its icon with
//! Xcode's `actool`, wraps it in an Xcode archive, and has Xcode sign it with
//! the creator's Apple team: an App Store build, optionally uploaded to App
//! Store Connect, or a development build installed on a connected device.
//! Runs only on macOS with Xcode.

// Other hosts only report that iOS export is unsupported, so the request
// fields and helpers that the macOS export uses go unread there.
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use routevn_android_export::space::{self, SpaceNeed};
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

    fn cancelled() -> Self {
        Self::new("cancelled", "The iOS export was cancelled.")
    }
}

/// Set by `cancel_ios_export` and cleared when an export starts. The running
/// export stops at its next check: at once while it waits for a tool, else
/// when the current packaging phase ends.
static CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);

fn check_cancelled(cancel: &AtomicBool) -> Result<(), IosExportError> {
    if cancel.load(Ordering::SeqCst) {
        Err(IosExportError::cancelled())
    } else {
        Ok(())
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
pub async fn get_ios_export_requirements() -> Result<IosExportRequirements, IosExportError> {
    run_blocking(|| Ok(imp::requirements())).await
}

#[tauri::command]
pub async fn export_ios_application(
    request: IosExportRequest,
    on_progress: Channel<routevn_exporter::ZipExportProgress>,
) -> Result<IosExportResult, IosExportError> {
    CANCEL_REQUESTED.store(false, Ordering::SeqCst);
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
        imp::export(request, Some(&progress_callback), &CANCEL_REQUESTED)
    })
    .await
}

/// Asks the running iOS export to stop. It rejects with the code `cancelled`,
/// or finishes when it was already past its last step.
#[tauri::command]
pub fn cancel_ios_export() {
    CANCEL_REQUESTED.store(true, Ordering::SeqCst);
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

/// How many times the size of the template archive the export may write for
/// the template: the expanded player in the Xcode archive, which is larger
/// than its compressed archive, and the copy inside the IPA.
const TEMPLATE_SPACE_FACTOR: u64 = 4;

/// The free space the export needs, given the estimated size of the game
/// package and the size of the template archive.
///
/// - packaging writes the plain game package and then its encrypted copy
///   into the workspace; both exist until encryption finishes
/// - signing keeps the encrypted package inside the Xcode archive while
///   Xcode writes the IPA, which holds the package again
/// - saving copies the IPA into the output folder while the workspace still
///   holds the archive and Xcode's IPA
///
/// A build that is only installed on a device has no output folder. When the
/// workspace and the output folder share a volume, the needs add up on it.
pub fn space_needs<'a>(
    temp_dir: &'a Path,
    output_dir: Option<&'a Path>,
    same_volume: bool,
    package_bytes: u64,
    template_bytes: u64,
) -> Vec<SpaceNeed<'a>> {
    let workspace = package_bytes
        .saturating_mul(2)
        .saturating_add(template_bytes.saturating_mul(TEMPLATE_SPACE_FACTOR));
    let ipa = package_bytes.saturating_add(template_bytes);
    let need = |path, bytes: u64| SpaceNeed {
        path,
        bytes: bytes.saturating_add(space::SPACE_MARGIN_BYTES),
    };
    match output_dir {
        None => vec![need(temp_dir, workspace)],
        Some(_) if same_volume => vec![need(temp_dir, workspace.saturating_add(ipa))],
        Some(output_dir) => vec![need(temp_dir, workspace), need(output_dir, ipa)],
    }
}

/// Fails with `not-enough-space` when a volume has less free space than it
/// needs. A volume whose free space cannot be measured is not checked.
fn check_space(
    needs: &[SpaceNeed<'_>],
    available: impl Fn(&Path) -> Option<u64>,
) -> Result<(), IosExportError> {
    space::check_space(needs, available)
        .map_err(|error| IosExportError::new("not-enough-space", error.message))
}

/// Stops the export before it writes anything when the workspace volume or
/// the output folder's volume is too full. The game package holds the assets
/// uncompressed with the instructions.
fn check_free_space(
    request: &IosExportRequest,
    assets: &[routevn_exporter::ZipAssetInput],
    instructions_json: &str,
) -> Result<(), IosExportError> {
    let temp_dir = std::env::temp_dir();
    // The output folder may not exist yet: its nearest existing parent is on
    // the volume it will be created on.
    let output_dir = request
        .output_path
        .as_deref()
        .and_then(Path::parent)
        .and_then(|parent| parent.ancestors().find(|folder| folder.is_dir()));
    // An asset that cannot be read is reported by packaging with its own
    // message, so it only drops out of the estimate here.
    let asset_bytes: u64 = assets
        .iter()
        .filter_map(|asset| std::fs::metadata(&asset.path).ok())
        .map(|metadata| metadata.len())
        .sum();
    let package_bytes = asset_bytes.saturating_add(instructions_json.len() as u64);
    let template_bytes = std::fs::metadata(&request.template_path)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    let needs = space_needs(
        &temp_dir,
        output_dir,
        output_dir.is_some_and(|output_dir| space::same_volume(&temp_dir, output_dir)),
        package_bytes,
        template_bytes,
    );
    check_space(&needs, space::available_space)
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
    } else if lower.contains("license agreement") || lower.contains("pla update") {
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

/// The error code for a failed `devicectl device install app`.
pub fn classify_install_failure(output: &str) -> &'static str {
    let lower = output.to_lowercase();
    if lower.contains("provisioning profile") || lower.contains("not registered") {
        "device-not-registered"
    } else if lower.contains("device was not found")
        || lower.contains("not connected")
        || lower.contains("device is unavailable")
        || lower.contains("device is not available")
    {
        "device-unavailable"
    } else {
        "install-failed"
    }
}

/// The Xcode to use, from each candidate's version (`None` when it does not
/// report one). The first Xcode that is new enough, else one that does not
/// report its version yet, since it may be new but not set up, else the
/// newest one.
pub fn pick_xcode<T>(
    candidates: &[(T, Option<(String, u32)>)],
) -> Option<&(T, Option<(String, u32)>)> {
    candidates
        .iter()
        .find(|(_, version)| {
            version
                .as_ref()
                .is_some_and(|(_, major)| *major >= MINIMUM_XCODE_MAJOR)
        })
        .or_else(|| candidates.iter().find(|(_, version)| version.is_none()))
        .or_else(|| {
            candidates
                .iter()
                .max_by_key(|(_, version)| version.as_ref().map_or(0, |(_, major)| *major))
        })
}

/// The most lines of Xcode's output an error keeps.
const MAX_DETAIL_LINES: usize = 20;

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
    lines[start..]
        .iter()
        .take(MAX_DETAIL_LINES)
        .copied()
        .collect::<Vec<_>>()
        .join("\n")
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
    // Drawn over white before scaling: scaling first would blend the hidden
    // color of transparent pixels into the edges.
    let opaque = RgbImage::from_fn(side, side, |x, y| {
        let [red, green, blue, alpha] = square.get_pixel(x, y).0;
        let over_white = |channel: u8| {
            let alpha = u32::from(alpha);
            ((u32::from(channel) * alpha + 255 * (255 - alpha) + 127) / 255) as u8
        };
        image::Rgb([over_white(red), over_white(green), over_white(blue)])
    });
    let opaque = imageops::resize(&opaque, SIZE, SIZE, FilterType::Lanczos3);
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
        _cancel: &AtomicBool,
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
    use std::io::Read;
    use std::os::unix::process::CommandExt;
    use std::path::{Path, PathBuf};
    use std::process::{Child, Command, Output, Stdio};
    use std::sync::mpsc;

    use super::*;

    // How long each external tool may run before the export stops waiting
    // and ends it. The limits are generous: they only catch a tool that hangs.

    /// The Xcode checks (`xcode-select`, `mdfind`, `xcodebuild -version`,
    /// `xcrun --find`, `defaults export`) answer within seconds; the first
    /// run after an Xcode update can take longer.
    const CHECK_TIMEOUT: Duration = Duration::from_secs(60);
    /// `devicectl list devices` waits a few seconds for devices on the
    /// network.
    const DEVICE_LIST_TIMEOUT: Duration = Duration::from_secs(60);
    /// `ditto` expands a template of about a megabyte and `actool` compiles
    /// one icon; `actool` may first start Xcode's asset catalog service.
    const TEMPLATE_TOOL_TIMEOUT: Duration = Duration::from_secs(10 * 60);
    /// Signing may create certificates and profiles over the network, then
    /// signs and compresses a game of several gigabytes.
    const SIGN_TIMEOUT: Duration = Duration::from_secs(30 * 60);
    /// Installing copies the whole game to the device, possibly over Wi-Fi.
    const INSTALL_TIMEOUT: Duration = Duration::from_secs(30 * 60);
    /// Opening the installed app.
    const LAUNCH_TIMEOUT: Duration = Duration::from_secs(60);
    /// Uploading a game of several gigabytes on a slow connection takes
    /// hours.
    const UPLOAD_TIMEOUT: Duration = Duration::from_secs(3 * 60 * 60);

    /// How often a running tool is checked for its exit, a cancel request,
    /// and its time limit.
    const POLL_INTERVAL: Duration = Duration::from_millis(50);
    /// How long a tool gets to exit after it is asked to, before it is
    /// killed.
    const STOP_GRACE: Duration = Duration::from_secs(2);

    const SIGTERM: i32 = 15;
    const SIGKILL: i32 = 9;

    unsafe extern "C" {
        fn killpg(group: i32, signal: i32) -> i32;
    }

    fn signal_group(child: &Child, signal: i32) {
        let Ok(group) = i32::try_from(child.id()) else {
            return;
        };
        // SAFETY: `killpg` takes plain integers. The child was started as the
        // leader of its own process group, so the group ID is its process ID.
        unsafe {
            killpg(group, signal);
        }
    }

    // Ends the tool and the helpers it started: asks them to exit, then
    // kills whatever is left of the group.
    fn stop(child: &mut Child) {
        signal_group(child, SIGTERM);
        let asked = Instant::now();
        while asked.elapsed() < STOP_GRACE && matches!(child.try_wait(), Ok(None)) {
            std::thread::sleep(POLL_INTERVAL);
        }
        signal_group(child, SIGKILL);
        let _ = child.kill();
        let _ = child.wait();
    }

    // Reads a pipe to its end on a thread, so a tool that writes a lot never
    // waits for the export to read.
    fn drain(pipe: Option<impl Read + Send + 'static>) -> mpsc::Receiver<Vec<u8>> {
        let (sender, receiver) = mpsc::channel();
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            if let Some(mut pipe) = pipe {
                let _ = pipe.read_to_end(&mut bytes);
            }
            let _ = sender.send(bytes);
        });
        receiver
    }

    fn describe_limit(limit: Duration) -> String {
        let seconds = limit.as_secs();
        if seconds >= 3600 && seconds.is_multiple_of(3600) {
            format!("{} h", seconds / 3600)
        } else if seconds >= 60 && seconds.is_multiple_of(60) {
            format!("{} min", seconds / 60)
        } else if seconds > 0 {
            format!("{seconds} s")
        } else {
            format!("{} ms", limit.as_millis())
        }
    }

    fn timed_out(action: &str, limit: Duration) -> IosExportError {
        IosExportError::new(
            "timed-out",
            format!(
                "Stopped waiting to {action} after {}.",
                describe_limit(limit)
            ),
        )
    }

    /// Runs an external tool to its end and returns its exit status and
    /// output. The tool is stopped, with the helpers it started, when it
    /// runs longer than `limit` (`timed-out`) or when `cancel` is set
    /// (`cancelled`).
    pub(super) fn run_tool(
        mut command: Command,
        action: &str,
        limit: Duration,
        cancel: &AtomicBool,
    ) -> Result<Output, IosExportError> {
        check_cancelled(cancel)?;
        command
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            // Its own process group, so that stopping it also stops the
            // helpers it starts, as xcodebuild does.
            .process_group(0);
        let mut child = command.spawn().map_err(io_error(action))?;
        let deadline = Instant::now() + limit;
        let stdout = drain(child.stdout.take());
        let stderr = drain(child.stderr.take());
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) => {}
                Err(error) => {
                    stop(&mut child);
                    return Err(io_error(action)(error));
                }
            }
            if cancel.load(Ordering::SeqCst) {
                stop(&mut child);
                return Err(IosExportError::cancelled());
            }
            if Instant::now() >= deadline {
                stop(&mut child);
                return Err(timed_out(action, limit));
            }
            std::thread::sleep(POLL_INTERVAL);
        };
        // A helper that outlives the tool can keep the pipes open, so the
        // output is not waited for past the limit either.
        let mut read = |pipe: mpsc::Receiver<Vec<u8>>| {
            let wait = deadline
                .saturating_duration_since(Instant::now())
                .max(STOP_GRACE);
            pipe.recv_timeout(wait).map_err(|_| {
                stop(&mut child);
                timed_out(action, limit)
            })
        };
        let stdout = read(stdout)?;
        let stderr = read(stderr)?;
        Ok(Output {
            status,
            stdout,
            stderr,
        })
    }

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

    // Runs a tool that must succeed.
    fn run(
        command: Command,
        action: &str,
        limit: Duration,
        cancel: &AtomicBool,
    ) -> Result<Output, IosExportError> {
        let output = run_tool(command, action, limit, cancel)?;
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
    fn developer_dir_candidates(cancel: &AtomicBool) -> Vec<PathBuf> {
        let mut candidates = Vec::new();
        let mut xcode_select = Command::new("/usr/bin/xcode-select");
        xcode_select.arg("-p");
        if let Ok(output) = run_tool(xcode_select, "find Xcode", CHECK_TIMEOUT, cancel)
            && output.status.success()
        {
            candidates.push(PathBuf::from(
                String::from_utf8_lossy(&output.stdout).trim(),
            ));
        }
        candidates.push(PathBuf::from("/Applications/Xcode.app/Contents/Developer"));
        let mut mdfind = Command::new("/usr/bin/mdfind");
        mdfind.arg("kMDItemCFBundleIdentifier == 'com.apple.dt.Xcode'");
        if let Ok(output) = run_tool(mdfind, "find Xcode", CHECK_TIMEOUT, cancel) {
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

    fn xcode_version(developer_dir: &Path, cancel: &AtomicBool) -> Option<(String, u32)> {
        let mut xcodebuild = Command::new(developer_dir.join("usr/bin/xcodebuild"));
        xcodebuild
            .env("DEVELOPER_DIR", developer_dir)
            .arg("-version");
        let output = run_tool(xcodebuild, "read the Xcode version", CHECK_TIMEOUT, cancel).ok()?;
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

    // A check that times out counts as failed, like one that cannot run.
    fn check_xcode(cancel: &AtomicBool) -> (XcodeStatus, Option<Xcode>) {
        let minimum_version = format!("{MINIMUM_XCODE_MAJOR}.0");
        let status = |status: &'static str, version: Option<String>| XcodeStatus {
            status,
            version,
            minimum_version: minimum_version.clone(),
        };
        let candidates = developer_dir_candidates(cancel);
        if candidates.is_empty() {
            return (status("notInstalled", None), None);
        }
        let versions: Vec<(PathBuf, Option<(String, u32)>)> = candidates
            .into_iter()
            .map(|dir| {
                let version = xcode_version(&dir, cancel);
                (dir, version)
            })
            .collect();
        let Some((developer_dir, version)) = pick_xcode(&versions) else {
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
        let succeeds = |command: Command| {
            run_tool(command, "check Xcode", CHECK_TIMEOUT, cancel)
                .is_ok_and(|output| output.status.success())
        };
        let mut first_launch = xcode.command("xcodebuild");
        first_launch.arg("-checkFirstLaunchStatus");
        if !succeeds(first_launch) {
            return (status("needsSetup", Some(version)), None);
        }
        let mut sdk = xcode.xcrun();
        sdk.args(["--sdk", "iphoneos", "--show-sdk-path"]);
        let mut actool = xcode.xcrun();
        actool.args(["--find", "actool"]);
        if !succeeds(sdk) || !succeeds(actool) {
            return (status("iosPlatformMissing", Some(version)), None);
        }
        (status("ready", Some(version)), Some(xcode))
    }

    fn signed_in_teams() -> Vec<AppleTeam> {
        let mut defaults = Command::new("/usr/bin/defaults");
        defaults.args(["export", "com.apple.dt.Xcode", "-"]);
        let Ok(output) = run_tool(
            defaults,
            "read the Xcode accounts",
            CHECK_TIMEOUT,
            &AtomicBool::new(false),
        ) else {
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
        let (xcode, _) = check_xcode(&AtomicBool::new(false));
        IosExportRequirements {
            xcode,
            teams: signed_in_teams(),
        }
    }

    fn require_xcode(cancel: &AtomicBool) -> Result<Xcode, IosExportError> {
        let checked = check_xcode(cancel);
        // A cancelled check reads as a failed one.
        check_cancelled(cancel)?;
        match checked {
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
        cancel: &AtomicBool,
    ) -> Result<IosExportResult, IosExportError> {
        validate_request(&request)?;
        let assets = std::mem::take(&mut request.assets);
        let instructions_json = std::mem::take(&mut request.instructions_json);
        let request = &request;
        emit(on_progress, "prepareApplication");
        check_free_space(request, &assets, &instructions_json)?;
        let xcode = require_xcode(cancel)?;
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
        run(
            ditto,
            "expand the iOS player template",
            TEMPLATE_TOOL_TIMEOUT,
            cancel,
        )?;
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

        // The package goes through files, so a large game is never held in
        // memory. Packaging and encryption cannot be interrupted, so a cancel
        // request takes effect when each one ends.
        check_cancelled(cancel)?;
        let package_path = temp.path().join("package.bin");
        let stats = routevn_exporter::create_package_bin_file_with_progress(
            &package_path,
            &assets,
            &instructions_json,
            on_progress,
        )
        .map_err(|error| {
            IosExportError::failed(format!("Failed to create the game package: {error}"))
        })?;
        drop(assets);
        let package_bin_bytes = stats.package_bin_bytes;
        check_cancelled(cancel)?;
        emit(on_progress, "encryptPayload");
        let (key, nonce) = routevn_packager::payload::generate_payload_key_material();
        let payload =
            routevn_packager::payload::write_standalone_chunked_encrypted_payload_from_file(
                routevn_packager::payload::WriteStandaloneChunkedPayloadFromFileRequest {
                    input_path: &package_path,
                    output_path: &app.join(PACKAGE_RESOURCE_NAME),
                    key,
                    nonce,
                    chunk_size: routevn_packager::payload::DEFAULT_PAYLOAD_CHUNK_SIZE,
                },
                |current, total| {
                    if let Some(on_progress) = on_progress {
                        on_progress(routevn_exporter::ZipExportProgress {
                            phase: "encryptPayload".to_string(),
                            current,
                            total,
                            elapsed_ms: 0,
                        });
                    }
                },
            )
            .map_err(|error| {
                IosExportError::failed(format!("Failed to encrypt the game package: {error}"))
            })?;
        fs::remove_file(&package_path).map_err(io_error("remove the game package"))?;

        check_cancelled(cancel)?;
        emit(on_progress, "compileAssets");
        let minimum_os = stamp_info_plist(&app, request)?;
        compile_assets(&xcode, &app, &icon, &minimum_os, temp.path(), cancel)?;
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
            cancel,
        )?;
        let ipa = find_ipa(&export_dir)?;
        let ipa_bytes = fs::metadata(&ipa).map_err(io_error("read the IPA"))?.len();

        // An install-only build is never saved: it installs from the
        // workspace, which is deleted when the export ends.
        let mut launched = false;
        check_cancelled(cancel)?;
        if let Some(output_path) = &request.output_path {
            emit(on_progress, "saveApplication");
            save(&ipa, output_path)?;
        } else if let Some(device_id) = &request.install_device_id {
            emit(on_progress, "installApplication");
            launched = install(&xcode, &ipa, device_id, &request.bundle_identifier, cancel)?;
        }

        let mut uploaded = false;
        if request.upload {
            emit(on_progress, "uploadApplication");
            // The IPA is already saved, so a failure here, a cancelled
            // upload included, says so.
            check_cancelled(cancel)
                .and_then(|()| {
                    export_archive(
                        &xcode,
                        &archive_path,
                        &temp.path().join("upload"),
                        request,
                        true,
                        temp.path(),
                        cancel,
                    )
                })
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
            stats,
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
        cancel: &AtomicBool,
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
        run(
            actool,
            "compile the app icon",
            TEMPLATE_TOOL_TIMEOUT,
            cancel,
        )?;
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
        cancel: &AtomicBool,
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
        let mut xcodebuild = xcode.command("xcodebuild");
        xcodebuild
            .arg("-exportArchive")
            .arg("-archivePath")
            .arg(archive)
            .arg("-exportPath")
            .arg(export_dir)
            .arg("-exportOptionsPlist")
            .arg(&options_path)
            .arg("-allowProvisioningUpdates");
        let output = if upload {
            run_tool(
                xcodebuild,
                "upload the app with Xcode",
                UPLOAD_TIMEOUT,
                cancel,
            )
        } else {
            run_tool(xcodebuild, "sign the app with Xcode", SIGN_TIMEOUT, cancel)
        }?;
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
        let bytes = fs::copy(ipa, &part).map_err(|error| {
            let _ = fs::remove_file(&part);
            IosExportError::failed(format!("Failed to save the IPA: {error}"))
        })?;
        fs::rename(&part, destination).map_err(|error| {
            let _ = fs::remove_file(&part);
            IosExportError::failed(format!("Failed to save the IPA: {error}"))
        })?;
        Ok(bytes)
    }

    pub fn list_devices() -> Result<Vec<IosDevice>, IosExportError> {
        let cancel = AtomicBool::new(false);
        let xcode = require_xcode(&cancel)?;
        let temp = tempfile::tempdir().map_err(io_error("create a temporary folder"))?;
        let json_path = temp.path().join("devices.json");
        let mut devicectl = xcode.xcrun();
        devicectl
            .args(["devicectl", "list", "devices", "--quiet", "--json-output"])
            .arg(&json_path);
        run(devicectl, "list devices", DEVICE_LIST_TIMEOUT, &cancel)?;
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
        cancel: &AtomicBool,
    ) -> Result<bool, IosExportError> {
        let mut install = xcode.xcrun();
        install
            .args([
                "devicectl",
                "device",
                "install",
                "app",
                "--device",
                device_id,
            ])
            .arg(ipa_path);
        let output = run_tool(
            install,
            "install the app on the device",
            INSTALL_TIMEOUT,
            cancel,
        )?;
        if !output.status.success() {
            let text = output_text(&output);
            return Err(IosExportError::new(
                classify_install_failure(&text),
                xcodebuild_details(&text),
            ));
        }
        // The app is installed, so a launch that fails or is cut short only
        // leaves it closed.
        let mut launch = xcode.xcrun();
        launch.args([
            "devicectl",
            "device",
            "process",
            "launch",
            "--device",
            device_id,
            bundle_identifier,
        ]);
        let launched = run_tool(launch, "open the app on the device", LAUNCH_TIMEOUT, cancel)
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
                "You must accept the latest Program License Agreement in your developer account.",
                true,
                "agreement-required",
            ),
            (
                "error: exportArchive The agreement field is not a signing error",
                false,
                "signing-failed",
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
    fn keeps_at_most_twenty_lines_of_xcode_output() {
        let output: String = (1..=30)
            .map(|line| format!("error: line {line}\n"))
            .collect();
        let details = xcodebuild_details(&output);
        assert_eq!(details.lines().count(), 20);
        assert!(details.ends_with("error: line 20"));
    }

    #[test]
    fn classifies_install_failures() {
        let cases = [
            (
                "ERROR: The specified device was not found. (Name: 00000000-0000) (com.apple.dt.CoreDeviceError error 1000 (0x3E8))",
                "device-unavailable",
            ),
            (
                "ERROR: Failed to install the app on the device.\n  The application's provisioning profile doesn't include this device.",
                "device-not-registered",
            ),
            (
                "ERROR: Failed to install the app on the device.\n  The file couldn't be opened because it doesn't exist.",
                "install-failed",
            ),
            ("ERROR: No provider was found.", "install-failed"),
        ];
        for (output, code) in cases {
            assert_eq!(classify_install_failure(output), code, "{output}");
        }
    }

    #[test]
    fn picks_the_xcode_to_use() {
        let version = |major: u32| Some((format!("{major}.0"), major));
        // A new enough Xcode wins.
        assert_eq!(
            pick_xcode(&[("old", version(16)), ("new", version(26))])
                .unwrap()
                .0,
            "new"
        );
        // An Xcode that needs setup beats an outdated one.
        assert_eq!(
            pick_xcode(&[("old", version(16)), ("unset", None)])
                .unwrap()
                .0,
            "unset"
        );
        // Else the newest.
        assert_eq!(
            pick_xcode(&[("older", version(15)), ("old", version(16))])
                .unwrap()
                .0,
            "old"
        );
        assert!(pick_xcode::<&str>(&[]).is_none());
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
        // The edge blends white into red, never darker: transparent pixels
        // are drawn over white before scaling.
        assert!(icon.pixels().all(|pixel| pixel.0[0] == 255));
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

    #[test]
    fn estimates_the_space_an_export_needs() {
        const MB: u64 = 1024 * 1024;
        let margin = space::SPACE_MARGIN_BYTES;
        let temp = Path::new("/temp");
        let output = Path::new("/output");
        let need = |path, bytes| SpaceNeed { path, bytes };
        // Two packages and the template in the workspace, the IPA in the
        // output folder.
        assert_eq!(
            space_needs(temp, Some(output), false, 1000 * MB, MB),
            vec![
                need(temp, 2004 * MB + margin),
                need(output, 1001 * MB + margin),
            ]
        );
        // On one volume they add up.
        assert_eq!(
            space_needs(temp, Some(output), true, 1000 * MB, MB),
            vec![need(temp, 3005 * MB + margin)]
        );
        // A build installed on a device is not saved.
        assert_eq!(
            space_needs(temp, None, true, 1000 * MB, MB),
            vec![need(temp, 2004 * MB + margin)]
        );
        assert_eq!(
            space_needs(temp, None, false, u64::MAX, u64::MAX),
            vec![need(temp, u64::MAX)]
        );
    }

    #[test]
    fn stops_when_a_volume_is_too_full() {
        let temp = Path::new("/temp");
        let output = Path::new("/output");
        let needs = space_needs(temp, Some(output), false, 1_000_000_000, 0);
        let free = |temp_free: Option<u64>, output_free: Option<u64>| {
            move |path: &Path| if path == temp { temp_free } else { output_free }
        };
        assert!(check_space(&needs, free(Some(u64::MAX), Some(u64::MAX))).is_ok());
        // A volume that cannot be measured is not checked.
        assert!(check_space(&needs, free(None, None)).is_ok());
        let error = check_space(&needs, free(Some(u64::MAX), Some(500_000_000))).unwrap_err();
        assert_eq!(error.code, "not-enough-space");
        assert!(!error.ipa_saved);
        assert!(error.message.contains("/output"), "{}", error.message);
        assert!(error.message.contains("500 MB"), "{}", error.message);
        let error = check_space(&needs, free(Some(0), Some(u64::MAX))).unwrap_err();
        assert!(error.message.contains("/temp"), "{}", error.message);
    }

    #[cfg(target_os = "macos")]
    mod tools {
        use std::process::Command;

        use super::*;

        const LONG: Duration = Duration::from_secs(60);

        fn shell(script: &str) -> Command {
            let mut command = Command::new("/bin/sh");
            command.args(["-c", script]);
            command
        }

        fn is_running(process_id: &str) -> bool {
            Command::new("/bin/kill")
                .args(["-0", process_id])
                .output()
                .unwrap()
                .status
                .success()
        }

        // Starts a shell that writes its own process ID and the ID of a
        // helper it starts, then waits. Returns the command and the file.
        fn tool_with_helper(folder: &Path) -> (Command, PathBuf) {
            let ids = folder.join("ids");
            let mut command = shell("/bin/sleep 30 & echo $$ $! > \"$IDS\"; wait");
            command.env("IDS", &ids);
            (command, ids)
        }

        fn assert_stopped(ids: &Path) {
            let ids = std::fs::read_to_string(ids).unwrap();
            let ids: Vec<&str> = ids.split_whitespace().collect();
            assert_eq!(ids.len(), 2);
            for id in ids {
                assert!(!is_running(id), "process {id} is still running");
            }
        }

        #[test]
        fn returns_the_output_of_a_tool() {
            let output = imp::run_tool(
                shell("echo out; echo err >&2; exit 3"),
                "run the tool",
                LONG,
                &AtomicBool::new(false),
            )
            .unwrap();
            assert_eq!(output.status.code(), Some(3));
            assert_eq!(output.stdout, b"out\n");
            assert_eq!(output.stderr, b"err\n");
        }

        #[test]
        fn reads_more_output_than_a_pipe_holds() {
            let output = imp::run_tool(
                shell("/usr/bin/head -c 1000000 /dev/zero; /usr/bin/head -c 1000000 /dev/zero >&2"),
                "run the tool",
                LONG,
                &AtomicBool::new(false),
            )
            .unwrap();
            assert!(output.status.success());
            assert_eq!(output.stdout.len(), 1_000_000);
            assert_eq!(output.stderr.len(), 1_000_000);
        }

        #[test]
        fn reports_a_tool_that_cannot_start() {
            let error = imp::run_tool(
                Command::new("/nonexistent/tool"),
                "run the tool",
                LONG,
                &AtomicBool::new(false),
            )
            .unwrap_err();
            assert_eq!(error.code, "export-failed");
            assert!(error.message.starts_with("Failed to run the tool:"));
        }

        #[test]
        fn stops_a_tool_that_runs_too_long() {
            let folder = tempfile::tempdir().unwrap();
            let (command, ids) = tool_with_helper(folder.path());
            let started = Instant::now();
            let error = imp::run_tool(
                command,
                "run the tool",
                Duration::from_millis(300),
                &AtomicBool::new(false),
            )
            .unwrap_err();
            assert_eq!(error.code, "timed-out");
            assert_eq!(
                error.message,
                "Stopped waiting to run the tool after 300 ms."
            );
            assert!(started.elapsed() < Duration::from_secs(10));
            assert_stopped(&ids);
        }

        #[test]
        fn stops_a_tool_when_the_export_is_cancelled() {
            let folder = tempfile::tempdir().unwrap();
            let (command, ids) = tool_with_helper(folder.path());
            let cancel = AtomicBool::new(false);
            let started = Instant::now();
            let error = std::thread::scope(|scope| {
                scope.spawn(|| {
                    std::thread::sleep(Duration::from_millis(300));
                    cancel.store(true, Ordering::SeqCst);
                });
                imp::run_tool(command, "run the tool", LONG, &cancel).unwrap_err()
            });
            assert_eq!(error, IosExportError::cancelled());
            assert_eq!(error.code, "cancelled");
            assert!(started.elapsed() < Duration::from_secs(10));
            assert_stopped(&ids);
        }

        #[test]
        fn does_not_start_a_tool_once_cancelled() {
            let folder = tempfile::tempdir().unwrap();
            let marker = folder.path().join("ran");
            let mut command = Command::new("/usr/bin/touch");
            command.arg(&marker);
            let error =
                imp::run_tool(command, "run the tool", LONG, &AtomicBool::new(true)).unwrap_err();
            assert_eq!(error.code, "cancelled");
            assert!(!marker.exists());
        }

        #[test]
        fn a_cancelled_export_writes_nothing() {
            let mut request = request();
            request.upload = false;
            let error = imp::export(request, None, &AtomicBool::new(true)).unwrap_err();
            assert_eq!(error.code, "cancelled");
            assert!(!error.ipa_saved);
        }
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
        let result = imp::export(request, None, &AtomicBool::new(false)).unwrap();
        println!("{}", serde_json::to_string(&result).unwrap());
    }
}
