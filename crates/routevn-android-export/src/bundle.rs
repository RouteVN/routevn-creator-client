//! Android App Bundle export for Google Play.
//!
//! A bundle holds the same player as the APK template, in the layout
//! bundletool reads: the manifest and resource table are protocol buffers,
//! and everything else sits under `base/`. Google Play builds the APKs
//! devices install from it and signs them with the app signing key. The
//! bundle itself is JAR-signed with the project's key, which becomes the
//! Play upload key.

use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::path::{Path, PathBuf};

use routevn_exporter::{PackageBinExportStats, ZipExportProgressCallback};
use routevn_packager::payload::StandaloneChunkedPayloadReader;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::{ExportError, Result};
use crate::jar;
use crate::proto_resources::{ResourceTable, ResourceValue};
use crate::proto_xml::{self, ProtoXml};
use crate::protobuf::Message;
use crate::signing::SigningKey;
use crate::template::{
    self, ColorSlot, ImageSlotDescriptor, TEMPLATE_APPLICATION_ID, is_signature_entry,
};
use crate::{
    AndroidExportRequest, Customization, Orientation, PreparedPackage, Progress, axml, zip,
};

pub const BUNDLE_DESCRIPTOR_FORMAT_VERSION: u32 = 1;
pub const BUNDLE_MANIFEST_ENTRY: &str = "base/manifest/AndroidManifest.xml";
pub const BUNDLE_RESOURCES_ENTRY: &str = "base/resources.pb";
pub const BUNDLE_CONFIG_ENTRY: &str = "BundleConfig.pb";
pub const BUNDLE_PACKAGE_ASSET_ENTRY: &str = "base/assets/routevn-package.bin";
/// The package's path inside the APKs Google Play builds.
const APK_PACKAGE_ASSET_PATH: &str = "assets/routevn-package.bin";

// BundleConfig
const CONFIG_COMPRESSION: u32 = 3;
// Compression
const COMPRESSION_UNCOMPRESSED_GLOB: u32 = 1;

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleTemplateDescriptor {
    pub format_version: u32,
    pub template_version_name: String,
    pub template_version_code: u32,
    pub template_application_id: String,
    pub min_sdk: u32,
    pub target_sdk: u32,
    pub abis: Vec<String>,
    pub application_id_strings: Vec<String>,
    pub components: Vec<String>,
    pub images: Vec<ImageSlotDescriptor>,
    pub sha256: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidBundleExportResult {
    pub output_path: PathBuf,
    pub bundle_bytes: u64,
    pub package_bin_bytes: u64,
    pub encrypted_payload_bytes: u64,
    pub stats: PackageBinExportStats,
    /// The SHA-256 of the upload certificate.
    pub signing_certificate_sha256: String,
}

/// Matches a path against a bundletool glob: `**` crosses folders, `*` and
/// `?` do not, and `[...]` lists characters.
fn glob_matches(pattern: &[u8], path: &[u8]) -> bool {
    match pattern {
        [] => path.is_empty(),
        [b'*', b'*', rest @ ..] => (0..=path.len()).any(|start| glob_matches(rest, &path[start..])),
        [b'*', rest @ ..] => {
            for start in 0..=path.len() {
                if glob_matches(rest, &path[start..]) {
                    return true;
                }
                if path.get(start) == Some(&b'/') {
                    break;
                }
            }
            false
        }
        [b'?', rest @ ..] => {
            matches!(path.first(), Some(byte) if *byte != b'/') && glob_matches(rest, &path[1..])
        }
        [b'[', rest @ ..] => {
            let Some(close) = rest.iter().position(|byte| *byte == b']') else {
                return false;
            };
            matches!(path.first(), Some(byte) if rest[..close].contains(byte))
                && glob_matches(&rest[close + 1..], &path[1..])
        }
        [literal, rest @ ..] => path.first() == Some(literal) && glob_matches(rest, &path[1..]),
    }
}

/// Whether the bundle keeps `apk_path` uncompressed in the APKs built from
/// it.
fn keeps_uncompressed(config: &[u8], apk_path: &str) -> Result<bool> {
    let config = Message::parse(config)?;
    let Some(compression) = config.message(CONFIG_COMPRESSION)? else {
        return Ok(false);
    };
    for glob in compression.bytes(COMPRESSION_UNCOMPRESSED_GLOB) {
        if glob_matches(glob, apk_path.as_bytes()) {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Validates a freshly built template bundle and describes it.
pub fn describe(bundle_path: &Path) -> Result<BundleTemplateDescriptor> {
    let mut file =
        File::open(bundle_path).map_err(|error| template::missing(bundle_path, error))?;
    let index = zip::read_index(&mut file)?;
    if index
        .entries
        .iter()
        .any(|entry| is_signature_entry(&entry.name))
    {
        return Err(ExportError::template(
            "The template bundle must not be signed.",
        ));
    }
    if index.entry(BUNDLE_PACKAGE_ASSET_ENTRY).is_some() {
        return Err(ExportError::template(
            "The template bundle must not contain a game package.",
        ));
    }
    let read = |file: &mut File, name: &str| {
        let entry = index
            .entry(name)
            .ok_or_else(|| ExportError::template(format!("The template bundle has no {name}.")))?;
        zip::read_entry(file, entry)
    };

    let config = read(&mut file, BUNDLE_CONFIG_ENTRY)?;
    if !keeps_uncompressed(&config, APK_PACKAGE_ASSET_PATH)? {
        return Err(ExportError::template(
            "The template bundle must keep the game package uncompressed.",
        ));
    }

    let manifest = ProtoXml::parse(&read(&mut file, BUNDLE_MANIFEST_ENTRY)?)?;
    let facts = proto_xml::manifest_facts(&manifest)?;
    template::check_template_manifest(&facts)?;
    let application_id_strings =
        template::template_application_id_strings(&proto_xml::strings(&manifest)?)?;
    template::check_dex_files(&mut file, &index, "base/dex/")?;

    let table = ResourceTable::parse(&read(&mut file, BUNDLE_RESOURCES_ENTRY)?)?;
    if table.package_names()? != [TEMPLATE_APPLICATION_ID] {
        return Err(ExportError::template(format!(
            "The template resources must be one package named {TEMPLATE_APPLICATION_ID}."
        )));
    }
    for slot in [ColorSlot::IconBackground, ColorSlot::SplashBackground] {
        if table.color_count(slot.template_value())? == 0 {
            return Err(ExportError::template(format!(
                "resources.pb has no color with the reserved value {}.",
                template::format_argb(slot.template_value())
            )));
        }
    }
    let images = template::describe_images(&mut file, &index, "base/", &|type_name, key| {
        table.file_paths(type_name, key)
    })?;

    Ok(BundleTemplateDescriptor {
        format_version: BUNDLE_DESCRIPTOR_FORMAT_VERSION,
        template_version_name: facts.version_name,
        template_version_code: facts.version_code,
        template_application_id: TEMPLATE_APPLICATION_ID.to_string(),
        min_sdk: facts.min_sdk,
        target_sdk: facts.target_sdk,
        abis: template::abis(&index, "base/lib/"),
        application_id_strings,
        components: facts.components,
        images,
        sha256: template::sha256_file(bundle_path)?,
    })
}

fn read_descriptor(descriptor_path: &Path) -> Result<BundleTemplateDescriptor> {
    let text = std::fs::read_to_string(descriptor_path)
        .map_err(|error| template::missing(descriptor_path, error))?;
    let descriptor: BundleTemplateDescriptor = serde_json::from_str(&text).map_err(|error| {
        ExportError::template(format!("The template descriptor is invalid: {error}"))
    })?;
    if descriptor.format_version != BUNDLE_DESCRIPTOR_FORMAT_VERSION {
        return Err(ExportError::template(
            "The Android player template is not supported by this version.",
        ));
    }
    if descriptor.template_application_id != TEMPLATE_APPLICATION_ID {
        return Err(ExportError::template(
            "The template descriptor names another application.",
        ));
    }
    Ok(descriptor)
}

/// Loads the descriptor and checks it matches the template bundle.
pub fn load_descriptor(
    bundle_path: &Path,
    descriptor_path: &Path,
) -> Result<BundleTemplateDescriptor> {
    let descriptor = read_descriptor(descriptor_path)?;
    if template::sha256_file(bundle_path)? != descriptor.sha256 {
        return Err(ExportError::template(
            "The Android player template does not match its descriptor.",
        ));
    }
    Ok(descriptor)
}

/// Reports whether this host can export bundles, without reading the whole
/// template.
pub fn host_capabilities(bundle_path: &Path, descriptor_path: &Path) -> crate::HostCapabilities {
    match check_template_files(bundle_path, descriptor_path) {
        Ok(()) => crate::HostCapabilities {
            available: true,
            reason: None,
        },
        Err(error) => crate::HostCapabilities {
            available: false,
            reason: Some(error.message),
        },
    }
}

/// Whether the template bundle is installed, without reading all of it.
fn check_template_files(bundle_path: &Path, descriptor_path: &Path) -> Result<()> {
    if !bundle_path.is_file() {
        return Err(ExportError::new(
            crate::ErrorCode::TemplateMissing,
            "The Android player template is not installed.",
        ));
    }
    read_descriptor(descriptor_path).map(|_| ())
}

fn customize_manifest(bytes: &[u8], customization: &Customization<'_>) -> Result<Vec<u8>> {
    let mut document = ProtoXml::parse(bytes)?;
    let template_prefix = format!("{TEMPLATE_APPLICATION_ID}.");
    let (orientation_text, orientation) = match customization.orientation {
        Orientation::Landscape => ("sensorLandscape", axml::SCREEN_ORIENTATION_SENSOR_LANDSCAPE),
        Orientation::Portrait => ("sensorPortrait", axml::SCREEN_ORIENTATION_SENSOR_PORTRAIT),
    };
    let mut replaced = 0;
    let mut version_codes = 0;
    let mut version_names = 0;
    let mut labels = 0;
    let mut orientations = 0;
    document.edit_attributes(&mut |element, attribute| {
        let renamed = attribute.string().and_then(|value| {
            if value == TEMPLATE_APPLICATION_ID {
                return Some(customization.application_id.to_string());
            }
            value
                .strip_prefix(&template_prefix)
                .map(|rest| format!("{}.{rest}", customization.application_id))
        });
        if let Some(renamed) = renamed {
            attribute.set_string(&renamed)?;
            replaced += 1;
        }
        match (element, attribute.resource_id) {
            ("manifest", axml::ATTR_VERSION_CODE) => {
                attribute.set_integer(
                    &customization.version_code.to_string(),
                    i64::from(customization.version_code),
                )?;
                version_codes += 1;
            }
            ("manifest", axml::ATTR_VERSION_NAME) => {
                attribute.set_string(customization.version_name)?;
                version_names += 1;
            }
            ("application" | "activity", axml::ATTR_LABEL) => {
                if attribute.string().is_none() {
                    return Err(ExportError::template(
                        "The template label must be a literal string.",
                    ));
                }
                attribute.set_string(customization.application_name)?;
                labels += 1;
            }
            ("activity", axml::ATTR_SCREEN_ORIENTATION) => {
                attribute.set_integer(orientation_text, i64::from(orientation))?;
                orientations += 1;
            }
            _ => {}
        }
        Ok(())
    })?;
    if replaced == 0 {
        return Err(ExportError::template(
            "The template manifest does not contain its application ID.",
        ));
    }
    if version_codes != 1 || version_names != 1 || labels == 0 || orientations != 1 {
        return Err(ExportError::template(
            "The template manifest is missing a value export sets.",
        ));
    }
    Ok(document.encode())
}

fn color_replacements(customization: &Customization<'_>) -> [(u32, u32); 2] {
    [
        (
            ColorSlot::IconBackground.template_value(),
            customization.icon_background,
        ),
        (
            ColorSlot::SplashBackground.template_value(),
            customization.splash_background,
        ),
    ]
}

/// The resource values a customized bundle must have: the template's, with
/// the reserved colors replaced.
fn expected_resource_values(
    template: &ResourceTable,
    customization: &Customization<'_>,
) -> Result<Vec<ResourceValue>> {
    let replacements = color_replacements(customization);
    Ok(template
        .values()?
        .into_iter()
        .map(|mut value| {
            if value.type_name == "color"
                && let Some((_, to)) = replacements
                    .iter()
                    .find(|(from, _)| value.color == Some(*from))
            {
                value.color = Some(*to);
            }
            value
        })
        .collect())
}

fn customize_resources(
    table: &ResourceTable,
    customization: &Customization<'_>,
) -> Result<Vec<u8>> {
    let mut table = ResourceTable::parse(&table.encode())?;
    let replaced = table.replace_colors(&color_replacements(customization))?;
    if replaced.contains(&0) {
        return Err(ExportError::template(
            "The template resources have no reserved color to replace.",
        ));
    }
    if table.rename_package(TEMPLATE_APPLICATION_ID, customization.application_id)? != 1 {
        return Err(ExportError::template(
            "The template resources are not named after the template.",
        ));
    }
    Ok(table.encode())
}

/// Where an entry's data comes from.
enum Source<'a> {
    Template(&'a zip::ZipEntry),
    Bytes(Vec<u8>),
    Package,
}

/// Exports an app bundle signed with `signing_key`, which Google Play
/// registers as the upload key. The bundle is verified against the key
/// before it is renamed into place.
pub fn export_android_app_bundle(
    request: &AndroidExportRequest,
    signing_key: &SigningKey,
    on_progress: Option<&ZipExportProgressCallback<'_>>,
) -> Result<AndroidBundleExportResult> {
    let progress = Progress::new(on_progress);
    let customization = crate::validate_request(request)?;

    progress.emit("prepareBundle", 0, 0);
    let descriptor = load_descriptor(&request.template_path, &request.descriptor_path)?;
    let icons = crate::load_icons(request)?;
    let work = crate::create_work_dir(request, "routevn-aab-")?;
    let PreparedPackage {
        file: mut package,
        encrypted_bytes,
        crc32: package_crc,
        sha256: package_sha256,
        stats,
    } = crate::prepare_package(request, work.path(), &progress, true)?;
    let package_sha256 = package_sha256.expect("asked for the package digest");

    let mut template_file = crate::open_template(&request.template_path)?;
    let template_index = zip::read_index(&mut template_file)?;
    let read = |file: &mut File, name: &str| {
        let entry = template_index
            .entry(name)
            .ok_or_else(|| ExportError::template(format!("The template bundle has no {name}.")))?;
        zip::read_entry(file, entry)
    };
    progress.emit("rewriteManifest", 0, 0);
    let manifest = customize_manifest(
        &read(&mut template_file, BUNDLE_MANIFEST_ENTRY)?,
        &customization,
    )?;
    let template_resources =
        ResourceTable::parse(&read(&mut template_file, BUNDLE_RESOURCES_ENTRY)?)?;
    let resources = customize_resources(&template_resources, &customization)?;
    let expected_resources = expected_resource_values(&template_resources, &customization)?;

    progress.emit("renderIcons", 0, descriptor.images.len() as u64);
    let mut images = HashMap::new();
    for (position, slot) in descriptor.images.iter().enumerate() {
        images.insert(slot.entry.clone(), icons.render(slot.kind, slot.size)?);
        progress.emit(
            "renderIcons",
            position as u64 + 1,
            descriptor.images.len() as u64,
        );
    }

    let mut sources = Vec::new();
    for entry in &template_index.entries {
        if is_signature_entry(&entry.name) || entry.name == BUNDLE_PACKAGE_ASSET_ENTRY {
            continue;
        }
        let source = if entry.name == BUNDLE_MANIFEST_ENTRY {
            Source::Bytes(manifest.clone())
        } else if entry.name == BUNDLE_RESOURCES_ENTRY {
            Source::Bytes(resources.clone())
        } else if let Some(bytes) = images.remove(&entry.name) {
            Source::Bytes(bytes)
        } else {
            Source::Template(entry)
        };
        sources.push((entry.name.clone(), source));
    }
    if let Some(missing) = images.keys().next() {
        return Err(ExportError::template(format!(
            "The template has no icon file {missing}."
        )));
    }
    sources.push((BUNDLE_PACKAGE_ASSET_ENTRY.to_string(), Source::Package));

    let total_entries = sources.len() as u64;
    let mut digests = Vec::with_capacity(sources.len());
    for (position, (name, source)) in sources.iter().enumerate() {
        progress.emit("signBundle", position as u64, total_entries);
        let digest: [u8; 32] = match source {
            Source::Template(entry) => {
                let mut hasher = Sha256::new();
                zip::for_each_chunk(&mut template_file, entry, &mut |chunk| hasher.update(chunk))?;
                hasher.finalize().into()
            }
            Source::Bytes(bytes) => Sha256::digest(bytes).into(),
            Source::Package => package_sha256,
        };
        digests.push((name.clone(), digest));
    }
    let signature = jar::sign(&digests, signing_key)?;
    progress.emit("signBundle", total_entries, total_entries);

    let (partial, output_file) =
        crate::create_partial_output(&request.output_path, "aab", "bundle")?;
    let mut writer = zip::ZipWriter::new(output_file);
    for (name, bytes) in signature.entries() {
        writer.add_stored(name, bytes)?;
    }
    for (position, (name, source)) in sources.iter().enumerate() {
        progress.emit("writeBundle", position as u64, total_entries);
        match source {
            Source::Template(entry) => writer.copy_entry(&mut template_file, entry)?,
            Source::Bytes(bytes) => writer.add_stored(name, bytes)?,
            Source::Package => {
                writer.add_stored_file(name, &mut package, package_crc, encrypted_bytes)?
            }
        }
    }
    writer.finish()?;
    progress.emit("writeBundle", total_entries, total_entries);

    let signed_by = verify_bundle(
        partial.path(),
        &customization,
        &expected_resources,
        stats.package_bin_bytes,
        &|current, total| progress.emit("verifyBundle", current, total),
    )?;
    if signed_by != signing_key.certificate_sha256() {
        return Err(ExportError::validation(
            "The bundle was signed with a different key.",
        ));
    }

    progress.emit("finalizeBundle", 0, 0);
    let bundle_bytes = crate::persist_output(partial, &request.output_path, "bundle")?;
    Ok(AndroidBundleExportResult {
        output_path: request.output_path.clone(),
        bundle_bytes,
        package_bin_bytes: stats.package_bin_bytes,
        encrypted_payload_bytes: encrypted_bytes,
        stats,
        signing_certificate_sha256: signing_key.certificate_sha256_hex(),
    })
}

/// Re-reads the written bundle, checks what Google Play and the player rely
/// on, and verifies its signature. Returns the signing certificate's
/// SHA-256.
fn verify_bundle(
    path: &Path,
    customization: &Customization<'_>,
    expected_resources: &[ResourceValue],
    package_bin_bytes: u64,
    on_progress: &dyn Fn(u64, u64),
) -> Result<[u8; 32]> {
    on_progress(0, 0);
    let mut file = File::open(path).map_err(|error| {
        ExportError::validation(format!("Failed to reopen the bundle: {error}"))
    })?;
    let index = zip::read_index(&mut file)?;
    let mut names = HashSet::new();
    for entry in &index.entries {
        if !names.insert(entry.name.as_str()) {
            return Err(ExportError::validation(format!(
                "The bundle repeats entry {}.",
                entry.name
            )));
        }
    }
    let read = |file: &mut File, name: &str| {
        let entry = index
            .entry(name)
            .ok_or_else(|| ExportError::validation(format!("The bundle has no {name}.")))?;
        zip::read_entry(file, entry)
    };

    if !keeps_uncompressed(
        &read(&mut file, BUNDLE_CONFIG_ENTRY)?,
        APK_PACKAGE_ASSET_PATH,
    )? {
        return Err(ExportError::validation(
            "The bundle does not keep the game package uncompressed.",
        ));
    }

    let manifest = ProtoXml::parse(&read(&mut file, BUNDLE_MANIFEST_ENTRY)?)?;
    let facts = proto_xml::manifest_facts(&manifest)?;
    if facts.package != customization.application_id
        || facts.version_code != customization.version_code
        || facts.version_name != customization.version_name
        || facts.label != customization.application_name
    {
        return Err(ExportError::validation(
            "The bundle manifest does not match the export settings.",
        ));
    }
    if facts.debuggable {
        return Err(ExportError::validation(
            "The bundle must not be debuggable.",
        ));
    }
    if proto_xml::strings(&manifest)?
        .iter()
        .any(|value| value.contains(TEMPLATE_APPLICATION_ID))
    {
        return Err(ExportError::validation(
            "The bundle manifest still references the template application ID.",
        ));
    }

    let resources = ResourceTable::parse(&read(&mut file, BUNDLE_RESOURCES_ENTRY)?)?;
    if resources.package_names()? != [customization.application_id]
        || resources.values()? != expected_resources
    {
        return Err(ExportError::validation(
            "The bundle resources do not match the export settings.",
        ));
    }

    let package = index
        .entry(BUNDLE_PACKAGE_ASSET_ENTRY)
        .ok_or_else(|| ExportError::validation("The bundle has no game package."))?;
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
    drop(file);

    jar::verify(path, on_progress)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_bundletool_globs() {
        let pattern = b"**[rR][oO][uU][tT][eE][vV][nN]-[pP][aA][cC][kK][aA][gG][eE].[bB][iI][nN]";
        assert!(glob_matches(pattern, b"assets/routevn-package.bin"));
        assert!(glob_matches(pattern, b"assets/RouteVN-Package.BIN"));
        assert!(!glob_matches(pattern, b"assets/routevn-package.bin.old"));
        assert!(glob_matches(b"**.[pP][nN][gG]", b"res/a/b.png"));
        assert!(!glob_matches(b"**.[pP][nN][gG]", b"res/a/b.jpg"));
        assert!(glob_matches(b"assets/*.bin", b"assets/game.bin"));
        assert!(!glob_matches(b"assets/*.bin", b"assets/web/game.bin"));
        assert!(glob_matches(b"assets/?.bin", b"assets/a.bin"));
        assert!(!glob_matches(b"assets/?.bin", b"assets/ab.bin"));
    }
}
