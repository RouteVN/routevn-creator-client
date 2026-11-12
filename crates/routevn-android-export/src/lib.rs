//! Builds an Android APK for a RouteVN game from the prebuilt player
//! template, unsigned or signed with APK Signature Scheme v2.
//!
//! The exporter streams the game package to disk, encrypts it in segments,
//! rewrites the template manifest and resources for the game, renders its
//! icons, writes an aligned APK, and signs it in place when given a key.
//! Memory use stays bounded by the largest single asset and the icon images,
//! so the same code runs on desktop and mobile hosts.

pub mod arsc;
pub mod axml;
pub mod error;
pub mod icons;
pub mod signing;
pub mod space;
pub mod template;
pub mod zip;

use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use routevn_exporter::{ZipAssetInput, ZipExportProgress, ZipExportProgressCallback};
use routevn_packager::payload::{
    DEFAULT_PAYLOAD_CHUNK_SIZE, StandaloneChunkedPayloadReader,
    WriteStandaloneChunkedPayloadFromFileRequest, generate_payload_key_material,
    write_standalone_chunked_encrypted_payload_from_file,
};
use serde::{Deserialize, Serialize};

pub use error::{ErrorCode, ExportError, Result};
pub use signing::{SigningKey, SigningKeyMaterial};
use template::{
    ColorSlot, MANIFEST_ENTRY, PACKAGE_ASSET_ENTRY, RESOURCES_ENTRY, TEMPLATE_APPLICATION_ID,
    TemplateDescriptor,
};

pub const MAX_VERSION_CODE: u32 = 2_100_000_000;
pub const MAX_APPLICATION_NAME_CHARS: usize = 100;
const RESERVED_APPLICATION_IDS: &[&str] = &[TEMPLATE_APPLICATION_ID, "com.routevn.creator"];

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Orientation {
    Landscape,
    Portrait,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidExportRequest {
    pub template_path: PathBuf,
    pub descriptor_path: PathBuf,
    pub output_path: PathBuf,
    pub assets: Vec<ZipAssetInput>,
    pub instructions_json: String,
    pub application_id: String,
    pub application_name: String,
    pub version_name: String,
    pub version_code: u32,
    pub orientation: Orientation,
    pub icon_path: PathBuf,
    #[serde(default)]
    pub adaptive_icon_path: Option<PathBuf>,
    #[serde(default)]
    pub splash_icon_path: Option<PathBuf>,
    pub icon_background_color: String,
    pub splash_background_color: String,
    /// Directory for intermediate files. Defaults to the system temp
    /// directory. Mobile hosts pass their cache directory.
    #[serde(default)]
    pub work_dir: Option<PathBuf>,
    /// Set by hosts that copy the finished APK to the creator's chosen
    /// location after the export, as the Android and iOS Creator do, so the
    /// free-space check also leaves room for that copy.
    #[serde(default)]
    pub copy_after_export: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidExportResult {
    pub output_path: PathBuf,
    pub apk_bytes: u64,
    pub package_bin_bytes: u64,
    pub encrypted_payload_bytes: u64,
    pub stats: routevn_exporter::PackageBinExportStats,
    /// The SHA-256 of the signing certificate, for a signed APK.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signing_certificate_sha256: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostCapabilities {
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

/// Reports whether this host can export, without reading the whole template.
pub fn host_capabilities(template_path: &Path, descriptor_path: &Path) -> HostCapabilities {
    match check_template_files(template_path, descriptor_path) {
        Ok(()) => HostCapabilities {
            available: true,
            reason: None,
        },
        Err(error) => HostCapabilities {
            available: false,
            reason: Some(error.message),
        },
    }
}

fn check_template_files(template_path: &Path, descriptor_path: &Path) -> Result<()> {
    if !template_path.is_file() {
        return Err(ExportError::new(
            ErrorCode::TemplateMissing,
            "The Android player template is not installed.",
        ));
    }
    let text = std::fs::read_to_string(descriptor_path).map_err(|_| {
        ExportError::new(
            ErrorCode::TemplateMissing,
            "The Android player template descriptor is not installed.",
        )
    })?;
    let descriptor: TemplateDescriptor = serde_json::from_str(&text).map_err(|error| {
        ExportError::template(format!("The template descriptor is invalid: {error}"))
    })?;
    if descriptor.format_version != template::DESCRIPTOR_FORMAT_VERSION {
        return Err(ExportError::template(
            "The Android player template is not supported by this version.",
        ));
    }
    Ok(())
}

pub fn is_valid_application_id(value: &str) -> bool {
    let segments: Vec<&str> = value.split('.').collect();
    segments.len() >= 2
        && segments.iter().all(|segment| {
            let mut chars = segment.chars();
            chars
                .next()
                .is_some_and(|first| first.is_ascii_alphabetic())
                && chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
        })
        && !RESERVED_APPLICATION_IDS.contains(&value)
}

pub fn is_valid_version_name(value: &str) -> bool {
    let components: Vec<&str> = value.split('.').collect();
    components.len() == 3
        && components.iter().all(|component| {
            !component.is_empty()
                && component.chars().all(|c| c.is_ascii_digit())
                && (component == &"0" || !component.starts_with('0'))
                && component.parse::<u64>().is_ok()
        })
}

/// Parses an opaque `#RRGGBB` color to ARGB.
pub fn parse_opaque_color(value: &str) -> Option<u32> {
    let hex = value.strip_prefix('#')?;
    if hex.len() != 6 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    u32::from_str_radix(hex, 16)
        .ok()
        .map(|rgb| 0xFF00_0000 | rgb)
}

fn validate_request(request: &AndroidExportRequest) -> Result<(u32, u32)> {
    let name = request.application_name.trim();
    if name.is_empty() {
        return Err(ExportError::invalid_request(
            "The application name is required.",
        ));
    }
    if name.chars().count() > MAX_APPLICATION_NAME_CHARS {
        return Err(ExportError::invalid_request(format!(
            "The application name must be at most {MAX_APPLICATION_NAME_CHARS} characters."
        )));
    }
    if !is_valid_application_id(&request.application_id) {
        return Err(ExportError::invalid_request(format!(
            "{} is not a valid Android application ID.",
            request.application_id
        )));
    }
    if !is_valid_version_name(&request.version_name) {
        return Err(ExportError::invalid_request(
            "The version must have three numeric parts, such as 1.0.0.",
        ));
    }
    if request.version_code == 0 || request.version_code > MAX_VERSION_CODE {
        return Err(ExportError::invalid_request(format!(
            "The build number must be from 1 to {MAX_VERSION_CODE}."
        )));
    }
    let icon_background = parse_opaque_color(&request.icon_background_color).ok_or_else(|| {
        ExportError::invalid_request("The icon background color must be #RRGGBB.")
    })?;
    let splash_background =
        parse_opaque_color(&request.splash_background_color).ok_or_else(|| {
            ExportError::invalid_request("The splash background color must be #RRGGBB.")
        })?;
    Ok((icon_background, splash_background))
}

const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);

/// Forwards progress with `elapsed_ms` set, at most every 100 ms except for
/// phase changes and completed phases. Hosts forward each event across a
/// native boundary, so the throttle keeps that traffic small.
struct Progress<'a> {
    callback: Option<&'a ZipExportProgressCallback<'a>>,
    started: Instant,
    last: Mutex<(String, Option<Instant>)>,
}

impl<'a> Progress<'a> {
    fn new(callback: Option<&'a ZipExportProgressCallback<'a>>) -> Self {
        Self {
            callback,
            started: Instant::now(),
            last: Mutex::new((String::new(), None)),
        }
    }

    fn forward(&self, mut progress: ZipExportProgress) {
        let Some(callback) = self.callback else {
            return;
        };
        let now = Instant::now();
        {
            let Ok(mut last) = self.last.lock() else {
                return;
            };
            let phase_changed = last.0 != progress.phase;
            let complete = progress.total > 0 && progress.current == progress.total;
            let interval_elapsed = last
                .1
                .is_none_or(|at| now.duration_since(at) >= PROGRESS_INTERVAL);
            if !phase_changed && !complete && !interval_elapsed {
                return;
            }
            last.0.clone_from(&progress.phase);
            last.1 = Some(now);
        }
        progress.elapsed_ms = u64::try_from(self.started.elapsed().as_millis()).unwrap_or(u64::MAX);
        callback(progress);
    }

    fn emit(&self, phase: &str, current: u64, total: u64) {
        self.forward(ZipExportProgress {
            phase: phase.to_string(),
            current,
            total,
            elapsed_ms: 0,
        });
    }
}

/// Exports an unsigned APK.
pub fn export_android_apk(
    request: &AndroidExportRequest,
    on_progress: Option<&ZipExportProgressCallback<'_>>,
) -> Result<AndroidExportResult> {
    export_android_apk_with_key(request, None, on_progress)
}

/// Exports an APK, signed with `signing_key` when one is given. The signed
/// file is verified against the key before it is renamed into place.
pub fn export_android_apk_with_key(
    request: &AndroidExportRequest,
    signing_key: Option<&SigningKey>,
    on_progress: Option<&ZipExportProgressCallback<'_>>,
) -> Result<AndroidExportResult> {
    let progress = Progress::new(on_progress);
    let forward_package_progress = |event: ZipExportProgress| progress.forward(event);
    let (icon_background, splash_background) = validate_request(request)?;

    progress.emit("prepareApk", 0, 0);
    let descriptor = template::load_descriptor(&request.template_path, &request.descriptor_path)?;
    let work_root = request.work_dir.clone().unwrap_or_else(std::env::temp_dir);
    let output_dir = request
        .output_path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    check_free_space(request, &work_root, output_dir)?;
    let icons = icons::IconImages {
        app: icons::load_icon(&request.icon_path, "app icon")?,
        adaptive: request
            .adaptive_icon_path
            .as_deref()
            .map(|path| icons::load_icon(path, "adaptive icon"))
            .transpose()?,
        splash: request
            .splash_icon_path
            .as_deref()
            .map(|path| icons::load_icon(path, "splash icon"))
            .transpose()?,
    };

    let work = tempfile::Builder::new()
        .prefix("routevn-apk-")
        .tempdir_in(&work_root)
        .map_err(|error| ExportError::write(format!("Failed to create a work folder: {error}")))?;

    let plain_path = work.path().join("package.bin");
    let stats = routevn_exporter::create_package_bin_file_with_progress(
        &plain_path,
        &request.assets,
        &request.instructions_json,
        Some(&forward_package_progress),
    )
    .map_err(|message| ExportError::new(ErrorCode::PackageFailed, message))?;
    let package_bin_bytes = stats.package_bin_bytes;

    progress.emit("encryptPayload", 0, package_bin_bytes);
    let encrypted_path = work.path().join("routevn-package.bin");
    let (key, nonce) = generate_payload_key_material();
    write_standalone_chunked_encrypted_payload_from_file(
        WriteStandaloneChunkedPayloadFromFileRequest {
            input_path: &plain_path,
            output_path: &encrypted_path,
            key,
            nonce,
            chunk_size: DEFAULT_PAYLOAD_CHUNK_SIZE,
        },
        |current, total| progress.emit("encryptPayload", current, total),
    )
    .map_err(|error| {
        ExportError::new(
            ErrorCode::PackageFailed,
            format!("Failed to encrypt the game package: {error}"),
        )
    })?;
    std::fs::remove_file(&plain_path).map_err(|error| {
        ExportError::write(format!("Failed to remove an intermediate file: {error}"))
    })?;

    let mut encrypted = File::open(&encrypted_path)
        .map_err(|error| ExportError::write(format!("Failed to open the game package: {error}")))?;
    let encrypted_payload_bytes = encrypted
        .metadata()
        .map_err(|error| ExportError::write(format!("Failed to read the game package: {error}")))?
        .len();
    let payload_crc = crc_of_file(&mut encrypted, encrypted_payload_bytes)?;

    let customization = Customization {
        application_id: &request.application_id,
        application_name: request.application_name.trim(),
        version_name: &request.version_name,
        version_code: request.version_code,
        orientation: request.orientation,
        icon_background,
        splash_background,
    };
    let mut template_file = File::open(&request.template_path).map_err(|error| {
        ExportError::new(
            ErrorCode::TemplateMissing,
            format!("Failed to open the Android player template: {error}"),
        )
    })?;
    let template_index = zip::read_index(&mut template_file)?;
    progress.emit("rewriteManifest", 0, 0);
    let manifest = customize_manifest(&mut template_file, &template_index, &customization)?;
    let resources = customize_resources(
        &mut template_file,
        &template_index,
        &descriptor,
        &customization,
    )?;
    progress.emit("renderIcons", 0, descriptor.images.len() as u64);
    let mut images = std::collections::HashMap::new();
    for (position, slot) in descriptor.images.iter().enumerate() {
        images.insert(slot.entry.clone(), icons.render(slot.kind, slot.size)?);
        progress.emit(
            "renderIcons",
            position as u64 + 1,
            descriptor.images.len() as u64,
        );
    }

    let partial = tempfile::Builder::new()
        .prefix(".routevn-apk-")
        .suffix(".partial")
        .tempfile_in(output_dir)
        .map_err(|error| ExportError::write(format!("Failed to create the APK file: {error}")))?;
    let output_file = partial
        .reopen()
        .map_err(|error| ExportError::write(format!("Failed to open the APK file: {error}")))?;

    let total_entries = template_index.entries.len() as u64 + 1;
    let mut writer = zip::ZipWriter::new(output_file);
    for (position, entry) in template_index.entries.iter().enumerate() {
        progress.emit("writeApk", position as u64, total_entries);
        if template::is_signature_entry(&entry.name) || entry.name == PACKAGE_ASSET_ENTRY {
            continue;
        }
        if entry.name == MANIFEST_ENTRY {
            writer.add_stored(&entry.name, &manifest)?;
        } else if entry.name == RESOURCES_ENTRY {
            writer.add_stored(&entry.name, &resources)?;
        } else if let Some(bytes) = images.remove(&entry.name) {
            writer.add_stored(&entry.name, &bytes)?;
        } else {
            writer.copy_entry(&mut template_file, entry)?;
        }
    }
    if let Some(missing) = images.keys().next() {
        return Err(ExportError::template(format!(
            "The template has no icon file {missing}."
        )));
    }
    progress.emit("writeApk", total_entries - 1, total_entries);
    writer.add_stored_file(
        PACKAGE_ASSET_ENTRY,
        &mut encrypted,
        payload_crc,
        encrypted_payload_bytes,
    )?;
    writer.finish()?;
    progress.emit("writeApk", total_entries, total_entries);

    progress.emit("verifyApk", 0, 0);
    verify_apk(partial.path(), &customization, package_bin_bytes)?;

    let signing_certificate_sha256 = match signing_key {
        Some(key) => {
            signing::sign_apk(partial.path(), key, &|current, total| {
                progress.emit("signApk", current, total)
            })?;
            let signed_by = signing::verify_apk_signature(partial.path(), &|current, total| {
                progress.emit("verifySignature", current, total)
            })?;
            if signed_by != key.certificate_sha256() {
                return Err(ExportError::validation(
                    "The APK was signed with a different key.",
                ));
            }
            Some(key.certificate_sha256_hex())
        }
        None => None,
    };

    progress.emit("finalizeApk", 0, 0);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(partial.path(), std::fs::Permissions::from_mode(0o644)).map_err(
            |error| ExportError::write(format!("Failed to set APK permissions: {error}")),
        )?;
    }
    let persisted = partial
        .persist(&request.output_path)
        .map_err(|error| ExportError::write(format!("Failed to save the APK: {}", error.error)))?;
    let apk_bytes = persisted
        .metadata()
        .map_err(|error| ExportError::write(format!("Failed to read the APK size: {error}")))?
        .len();

    Ok(AndroidExportResult {
        output_path: request.output_path.clone(),
        apk_bytes,
        package_bin_bytes,
        encrypted_payload_bytes,
        stats,
        signing_certificate_sha256,
    })
}

/// Stops the export before it writes anything when a volume it writes to is
/// too full. The game package holds the assets uncompressed with the
/// instructions, and the APK holds the encrypted package and the template.
fn check_free_space(
    request: &AndroidExportRequest,
    work_root: &Path,
    output_dir: &Path,
) -> Result<()> {
    // An asset that cannot be read is reported by packaging with its own
    // message, so it only drops out of the estimate here.
    let asset_bytes: u64 = request
        .assets
        .iter()
        .filter_map(|asset| std::fs::metadata(&asset.path).ok())
        .map(|metadata| metadata.len())
        .sum();
    let package_bytes = asset_bytes.saturating_add(request.instructions_json.len() as u64);
    let template_bytes = std::fs::metadata(&request.template_path)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    let apk_bytes = package_bytes.saturating_add(template_bytes);
    let needs = space::space_needs(
        work_root,
        output_dir,
        space::same_volume(work_root, output_dir),
        package_bytes,
        apk_bytes,
        request.copy_after_export,
    );
    space::check_space(&needs, space::available_space)
}

fn crc_of_file(file: &mut File, length: u64) -> Result<u32> {
    let mut crc = zip::Crc32::default();
    let mut buffer = vec![0u8; 1024 * 1024];
    let mut read_total = 0u64;
    loop {
        let read = file.read(&mut buffer).map_err(|error| {
            ExportError::write(format!("Failed to read the game package: {error}"))
        })?;
        if read == 0 {
            break;
        }
        crc.update(&buffer[..read]);
        read_total += read as u64;
    }
    if read_total != length {
        return Err(ExportError::write(
            "The game package changed while it was read.",
        ));
    }
    Ok(crc.finish())
}

struct Customization<'a> {
    application_id: &'a str,
    application_name: &'a str,
    version_name: &'a str,
    version_code: u32,
    orientation: Orientation,
    icon_background: u32,
    splash_background: u32,
}

fn customize_manifest(
    file: &mut File,
    index: &zip::ZipIndex,
    customization: &Customization<'_>,
) -> Result<Vec<u8>> {
    let entry = index
        .entry(MANIFEST_ENTRY)
        .ok_or_else(|| ExportError::template("The template APK has no AndroidManifest.xml."))?;
    let mut document = axml::BinaryXml::parse(&zip::read_entry(file, entry)?)?;

    let template_prefix = format!("{TEMPLATE_APPLICATION_ID}.");
    let replaced = document.replace_strings(|value| {
        if value == TEMPLATE_APPLICATION_ID {
            return Some(customization.application_id.to_string());
        }
        value
            .strip_prefix(&template_prefix)
            .map(|rest| format!("{}.{rest}", customization.application_id))
    });
    if replaced == 0 {
        return Err(ExportError::template(
            "The template manifest does not contain its application ID.",
        ));
    }

    let root = document
        .root()
        .cloned()
        .ok_or_else(|| ExportError::template("The template manifest is empty."))?;
    let version_code = document
        .find_attribute(&root, Some(axml::ATTR_VERSION_CODE), "")
        .cloned()
        .ok_or_else(|| ExportError::template("The template manifest has no versionCode."))?;
    document.set_integer(&version_code, customization.version_code)?;
    let version_name = document
        .find_attribute(&root, Some(axml::ATTR_VERSION_NAME), "")
        .cloned()
        .ok_or_else(|| ExportError::template("The template manifest has no versionName."))?;
    document.set_string(&version_name, customization.version_name)?;

    let labelled: Vec<axml::Element> = document
        .find_elements("application")
        .chain(document.find_elements("activity"))
        .cloned()
        .collect();
    let mut label_count = 0;
    for element in &labelled {
        if let Some(label) = document
            .find_attribute(element, Some(axml::ATTR_LABEL), "")
            .cloned()
        {
            if label.value_type != axml::TYPE_STRING {
                return Err(ExportError::template(
                    "The template label must be a literal string.",
                ));
            }
            document.set_string(&label, customization.application_name)?;
            label_count += 1;
        }
    }
    if label_count == 0 {
        return Err(ExportError::template("The template manifest has no label."));
    }

    let activity = document
        .find_elements("activity")
        .next()
        .cloned()
        .ok_or_else(|| ExportError::template("The template manifest has no activity."))?;
    let orientation = document
        .find_attribute(&activity, Some(axml::ATTR_SCREEN_ORIENTATION), "")
        .cloned()
        .ok_or_else(|| ExportError::template("The template activity has no screenOrientation."))?;
    document.set_integer(
        &orientation,
        match customization.orientation {
            Orientation::Landscape => axml::SCREEN_ORIENTATION_SENSOR_LANDSCAPE,
            Orientation::Portrait => axml::SCREEN_ORIENTATION_SENSOR_PORTRAIT,
        },
    )?;

    document.encode()
}

fn customize_resources(
    file: &mut File,
    index: &zip::ZipIndex,
    descriptor: &TemplateDescriptor,
    customization: &Customization<'_>,
) -> Result<Vec<u8>> {
    let entry = index
        .entry(RESOURCES_ENTRY)
        .ok_or_else(|| ExportError::template("The template APK has no resources.arsc."))?;
    let mut bytes = zip::read_entry(file, entry)?;
    for color in &descriptor.colors {
        let value = match color.slot {
            ColorSlot::IconBackground => customization.icon_background,
            ColorSlot::SplashBackground => customization.splash_background,
        };
        for offset in &color.offsets {
            let offset = usize::try_from(*offset)
                .map_err(|_| ExportError::template("A template color offset is out of range."))?;
            arsc::patch_color(&mut bytes, offset, color.slot.template_value(), value)?;
        }
    }
    Ok(bytes)
}

/// Re-reads the written APK and checks what Android and the player rely on.
fn verify_apk(
    path: &Path,
    customization: &Customization<'_>,
    package_bin_bytes: u64,
) -> Result<()> {
    let mut file = File::open(path)
        .map_err(|error| ExportError::validation(format!("Failed to reopen the APK: {error}")))?;
    let index = zip::read_index(&mut file)?;
    if index.has_apk_signing_block
        || index
            .entries
            .iter()
            .any(|entry| template::is_signature_entry(&entry.name))
    {
        return Err(ExportError::validation(
            "The APK still contains signing data.",
        ));
    }
    let mut names = std::collections::HashSet::new();
    for entry in &index.entries {
        if !names.insert(entry.name.as_str()) {
            return Err(ExportError::validation(format!(
                "The APK repeats entry {}.",
                entry.name
            )));
        }
    }
    template::check_alignment(&index)?;

    let resources = index
        .entry(RESOURCES_ENTRY)
        .ok_or_else(|| ExportError::validation("The APK has no resources.arsc."))?;
    if !resources.is_stored() {
        return Err(ExportError::validation(
            "resources.arsc must be stored uncompressed.",
        ));
    }
    let table = arsc::ResourceTable::parse(&zip::read_entry(&mut file, resources)?)?;
    for (slot, value) in [
        (ColorSlot::IconBackground, customization.icon_background),
        (ColorSlot::SplashBackground, customization.splash_background),
    ] {
        if !table.color_offsets(slot.template_value()).is_empty() && slot.template_value() != value
        {
            return Err(ExportError::validation(
                "A template color was not replaced.",
            ));
        }
    }

    let manifest_entry = index
        .entry(MANIFEST_ENTRY)
        .ok_or_else(|| ExportError::validation("The APK has no AndroidManifest.xml."))?;
    let manifest = axml::BinaryXml::parse(&zip::read_entry(&mut file, manifest_entry)?)?;
    let facts = template::manifest_facts(&manifest)?;
    if facts.package != customization.application_id
        || facts.version_code != customization.version_code
        || facts.version_name != customization.version_name
        || facts.label != customization.application_name
    {
        return Err(ExportError::validation(
            "The APK manifest does not match the export settings.",
        ));
    }
    if facts.debuggable {
        return Err(ExportError::validation("The APK must not be debuggable."));
    }
    if manifest
        .pool
        .strings
        .iter()
        .any(|value| value.contains(TEMPLATE_APPLICATION_ID))
    {
        return Err(ExportError::validation(
            "The APK manifest still references the template application ID.",
        ));
    }

    let package = index
        .entry(PACKAGE_ASSET_ENTRY)
        .ok_or_else(|| ExportError::validation("The APK has no game package."))?;
    if !package.is_stored() {
        return Err(ExportError::validation(
            "The game package must be stored uncompressed.",
        ));
    }
    let reader = StandaloneChunkedPayloadReader::open_range(
        path,
        package.data_offset,
        package.compressed_size,
    )
    .map_err(|error| {
        ExportError::validation(format!("The game package cannot be read: {error}"))
    })?;
    if reader.plaintext_len() != package_bin_bytes {
        return Err(ExportError::validation(
            "The game package has the wrong size.",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_application_ids() {
        for valid in ["com.example.game", "a.b", "Com.Example_1.x2"] {
            assert!(is_valid_application_id(valid), "{valid}");
        }
        for invalid in [
            "",
            "game",
            "com.example-game",
            "com.1game",
            "com._game",
            "com..game",
            ".com.game",
            "com.game.",
            "com.ゲーム",
            TEMPLATE_APPLICATION_ID,
            "com.routevn.creator",
        ] {
            assert!(!is_valid_application_id(invalid), "{invalid}");
        }
    }

    #[test]
    fn validates_version_names() {
        for valid in ["0.0.0", "1.2.3", "10.20.30"] {
            assert!(is_valid_version_name(valid), "{valid}");
        }
        for invalid in [
            "1.2", "1.2.3.4", "01.2.3", "1.a.3", "1..3", " 1.2.3", "-1.2.3",
        ] {
            assert!(!is_valid_version_name(invalid), "{invalid}");
        }
    }

    #[test]
    fn parses_opaque_colors() {
        assert_eq!(parse_opaque_color("#FFFFFF"), Some(0xFFFF_FFFF));
        assert_eq!(parse_opaque_color("#12abEF"), Some(0xFF12_ABEF));
        assert_eq!(parse_opaque_color("#000000"), Some(0xFF00_0000));
        for invalid in ["FFFFFF", "#FFF", "#FFFFFFFF", "#GGGGGG", "", "#+12345"] {
            assert_eq!(parse_opaque_color(invalid), None, "{invalid}");
        }
    }
}
