//! Player template inspection: validates a built template APK and describes
//! what the exporter must change in it.

use std::collections::BTreeSet;
use std::fs::File;
use std::io::Read;
use std::path::Path;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::arsc::ResourceTable;
use crate::axml::{self, BinaryXml};
use crate::error::{ErrorCode, ExportError, Result};
use crate::icons::{self, ImageKind};
use crate::zip::{self, ZipIndex};

pub const DESCRIPTOR_FORMAT_VERSION: u32 = 1;
pub const TEMPLATE_APPLICATION_ID: &str = "vn.routevn.androidplayer.template";
pub const EXPECTED_MIN_SDK: u32 = 24;
pub const EXPECTED_TARGET_SDK: u32 = 37;
pub const ICON_BACKGROUND_TEMPLATE_COLOR: u32 = 0xFF13_579B;
pub const SPLASH_BACKGROUND_TEMPLATE_COLOR: u32 = 0xFF24_68AC;
pub const PACKAGE_ASSET_ENTRY: &str = "assets/routevn-package.bin";
pub const MANIFEST_ENTRY: &str = "AndroidManifest.xml";
pub const RESOURCES_ENTRY: &str = "resources.arsc";

/// Components merged in by AndroidX that are safe to ship unchanged.
const ALLOWED_COMPONENTS: &[&str] = &["androidx.profileinstaller.ProfileInstallReceiver"];

/// Permissions the template may declare or use besides application-ID-derived
/// ones. `DUMP` protects the profile installer receiver above.
const ALLOWED_PERMISSIONS: &[&str] = &["android.permission.DUMP"];

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ColorSlot {
    IconBackground,
    SplashBackground,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageSlotDescriptor {
    pub entry: String,
    pub kind: ImageKind,
    pub size: u32,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColorSlotDescriptor {
    pub slot: ColorSlot,
    pub template_value: String,
    pub offsets: Vec<u64>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateDescriptor {
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
    pub colors: Vec<ColorSlotDescriptor>,
    pub sha256: String,
}

impl ColorSlot {
    pub fn template_value(self) -> u32 {
        match self {
            Self::IconBackground => ICON_BACKGROUND_TEMPLATE_COLOR,
            Self::SplashBackground => SPLASH_BACKGROUND_TEMPLATE_COLOR,
        }
    }
}

pub fn format_argb(value: u32) -> String {
    format!("#{value:08X}")
}

pub fn sha256_file(path: &Path) -> Result<String> {
    let mut file = File::open(path).map_err(|error| missing(path, error))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1024 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|error| {
            ExportError::template(format!("Failed to read the template: {error}"))
        })?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(crate::signing::hex(&hasher.finalize()))
}

fn missing(path: &Path, error: std::io::Error) -> ExportError {
    ExportError::new(
        ErrorCode::TemplateMissing,
        format!(
            "The Android player template {} is unavailable: {error}",
            path.display()
        ),
    )
}

pub fn is_signature_entry(name: &str) -> bool {
    let Some(file) = name.strip_prefix("META-INF/") else {
        return false;
    };
    if file.contains('/') {
        return false;
    }
    let upper = file.to_ascii_uppercase();
    upper == "MANIFEST.MF"
        || [".SF", ".RSA", ".DSA", ".EC"]
            .iter()
            .any(|extension| upper.ends_with(extension))
}

/// Facts read from a template or exported manifest.
#[derive(Debug)]
pub struct ManifestFacts {
    pub package: String,
    pub version_code: u32,
    pub version_name: String,
    pub label: String,
    pub min_sdk: u32,
    pub target_sdk: u32,
    pub debuggable: bool,
    pub orientation: u32,
    pub components: Vec<String>,
    pub permissions: Vec<String>,
}

pub fn manifest_facts(document: &BinaryXml) -> Result<ManifestFacts> {
    let invalid = |message: &str| ExportError::template(format!("AndroidManifest.xml: {message}"));
    let root = document
        .root()
        .filter(|element| element.name == "manifest")
        .ok_or_else(|| invalid("missing <manifest>"))?;
    let package = document
        .find_attribute(root, None, "package")
        .and_then(|attribute| document.attribute_string(attribute))
        .ok_or_else(|| invalid("missing package"))?
        .to_string();
    let version_code = document
        .find_attribute(root, Some(axml::ATTR_VERSION_CODE), "")
        .ok_or_else(|| invalid("missing versionCode"))?
        .data;
    let version_name = document
        .find_attribute(root, Some(axml::ATTR_VERSION_NAME), "")
        .and_then(|attribute| document.attribute_string(attribute))
        .ok_or_else(|| invalid("missing versionName"))?
        .to_string();

    let uses_sdk = document.find_elements("uses-sdk").next();
    let sdk = |id| {
        uses_sdk
            .and_then(|element| document.find_attribute(element, Some(id), ""))
            .map(|attribute| attribute.data)
            .unwrap_or_default()
    };

    let mut applications = document.find_elements("application");
    let application = applications
        .next()
        .ok_or_else(|| invalid("missing <application>"))?;
    if applications.next().is_some() {
        return Err(invalid("more than one <application>"));
    }
    let label_attribute = document
        .find_attribute(application, Some(axml::ATTR_LABEL), "")
        .ok_or_else(|| invalid("missing application label"))?;
    if label_attribute.value_type != axml::TYPE_STRING {
        return Err(invalid("the application label must be a literal string"));
    }
    let label = document
        .attribute_string(label_attribute)
        .unwrap_or_default()
        .to_string();
    let debuggable = document
        .find_attribute(application, Some(axml::ATTR_DEBUGGABLE), "")
        .is_some_and(|attribute| attribute.data != 0);

    let activities: Vec<_> = document
        .find_elements("activity")
        .chain(document.find_elements("activity-alias"))
        .collect();
    if activities.len() != 1 {
        return Err(invalid("the template must declare exactly one activity"));
    }
    let orientation = document
        .find_attribute(activities[0], Some(axml::ATTR_SCREEN_ORIENTATION), "")
        .ok_or_else(|| invalid("the activity has no screenOrientation"))?
        .data;

    let name_of = |element: &axml::Element| {
        document
            .find_attribute(element, Some(axml::ATTR_NAME), "")
            .and_then(|attribute| document.attribute_string(attribute))
            .unwrap_or_default()
            .to_string()
    };
    let components = ["provider", "service", "receiver"]
        .iter()
        .flat_map(|kind| document.find_elements(kind))
        .map(name_of)
        .collect();
    let permissions = ["permission", "uses-permission", "uses-permission-sdk-23"]
        .iter()
        .flat_map(|kind| document.find_elements(kind))
        .map(name_of)
        .collect();

    Ok(ManifestFacts {
        package,
        version_code,
        version_name,
        label,
        min_sdk: sdk(axml::ATTR_MIN_SDK_VERSION),
        target_sdk: sdk(axml::ATTR_TARGET_SDK_VERSION),
        debuggable,
        orientation,
        components,
        permissions,
    })
}

pub fn is_application_id_derived(value: &str, application_id: &str) -> bool {
    value == application_id
        || value
            .strip_prefix(application_id)
            .is_some_and(|rest| rest.starts_with('.'))
}

/// Validates a freshly built template APK and describes it.
pub fn describe(apk_path: &Path) -> Result<TemplateDescriptor> {
    let mut file = File::open(apk_path).map_err(|error| missing(apk_path, error))?;
    let index = zip::read_index(&mut file)?;

    if index.has_apk_signing_block
        || index
            .entries
            .iter()
            .any(|entry| is_signature_entry(&entry.name))
    {
        return Err(ExportError::template(
            "The template APK must not be signed.",
        ));
    }
    if index.entry(PACKAGE_ASSET_ENTRY).is_some() {
        return Err(ExportError::template(
            "The template APK must not contain a game package.",
        ));
    }
    check_alignment(&index)?;

    let manifest_entry = index
        .entry(MANIFEST_ENTRY)
        .ok_or_else(|| ExportError::template("The template APK has no AndroidManifest.xml."))?;
    let manifest = BinaryXml::parse(&zip::read_entry(&mut file, manifest_entry)?)?;
    let facts = manifest_facts(&manifest)?;
    if facts.package != TEMPLATE_APPLICATION_ID {
        return Err(ExportError::template(format!(
            "The template package is {}, expected {TEMPLATE_APPLICATION_ID}.",
            facts.package
        )));
    }
    if facts.debuggable {
        return Err(ExportError::template(
            "The template APK must not be debuggable.",
        ));
    }
    if facts.min_sdk != EXPECTED_MIN_SDK || facts.target_sdk != EXPECTED_TARGET_SDK {
        return Err(ExportError::template(format!(
            "The template targets SDK {}..{}, expected {EXPECTED_MIN_SDK}..{EXPECTED_TARGET_SDK}.",
            facts.min_sdk, facts.target_sdk
        )));
    }
    for component in &facts.components {
        if !ALLOWED_COMPONENTS.contains(&component.as_str()) {
            return Err(ExportError::template(format!(
                "The template declares an unexpected component {component}."
            )));
        }
    }
    for permission in &facts.permissions {
        if !is_application_id_derived(permission, TEMPLATE_APPLICATION_ID)
            && !ALLOWED_PERMISSIONS.contains(&permission.as_str())
        {
            return Err(ExportError::template(format!(
                "The template uses an unexpected permission {permission}."
            )));
        }
    }
    let application_id_strings: Vec<String> = manifest
        .pool
        .strings
        .iter()
        .filter(|value| is_application_id_derived(value, TEMPLATE_APPLICATION_ID))
        .cloned()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    if manifest.pool.strings.iter().any(|value| {
        value.contains(TEMPLATE_APPLICATION_ID)
            && !is_application_id_derived(value, TEMPLATE_APPLICATION_ID)
    }) {
        return Err(ExportError::template(
            "The template manifest embeds its application ID inside another value.",
        ));
    }

    for entry in index
        .entries
        .iter()
        .filter(|entry| entry.name.starts_with("classes") && entry.name.ends_with(".dex"))
    {
        let dex = zip::read_entry(&mut file, entry)?;
        if dex
            .windows(TEMPLATE_APPLICATION_ID.len())
            .any(|window| window == TEMPLATE_APPLICATION_ID.as_bytes())
        {
            return Err(ExportError::template(format!(
                "{} references the template application ID, which export cannot change.",
                entry.name
            )));
        }
    }

    let resources_entry = index
        .entry(RESOURCES_ENTRY)
        .ok_or_else(|| ExportError::template("The template APK has no resources.arsc."))?;
    if !resources_entry.is_stored() {
        return Err(ExportError::template(
            "resources.arsc must be stored uncompressed.",
        ));
    }
    let table = ResourceTable::parse(&zip::read_entry(&mut file, resources_entry)?)?;

    let mut colors = Vec::new();
    for slot in [ColorSlot::IconBackground, ColorSlot::SplashBackground] {
        let offsets = table.color_offsets(slot.template_value());
        if offsets.is_empty() {
            return Err(ExportError::template(format!(
                "resources.arsc has no {} color with the reserved value {}.",
                match slot {
                    ColorSlot::IconBackground => "icon background",
                    ColorSlot::SplashBackground => "splash background",
                },
                format_argb(slot.template_value())
            )));
        }
        colors.push(ColorSlotDescriptor {
            slot,
            template_value: format_argb(slot.template_value()),
            offsets: offsets.into_iter().map(|offset| offset as u64).collect(),
        });
    }

    let mut images = Vec::new();
    for (type_name, key, kind) in [
        ("mipmap", "ic_launcher", ImageKind::Legacy),
        (
            "mipmap",
            "ic_launcher_foreground",
            ImageKind::AdaptiveForeground,
        ),
        ("drawable", "splash_icon", ImageKind::Splash),
    ] {
        let paths: Vec<_> = table
            .file_paths(type_name, key)
            .into_iter()
            .filter(|(_, path)| path.ends_with(".png"))
            .collect();
        if paths.len() < 5 {
            return Err(ExportError::template(format!(
                "Expected PNG {type_name}/{key} for five densities, found {}.",
                paths.len()
            )));
        }
        for (density, path) in paths {
            let size = kind.pixel_size(density);
            let entry = index
                .entry(&path)
                .ok_or_else(|| ExportError::template(format!("Missing icon file {path}.")))?;
            let dimensions = icons::png_dimensions(&zip::read_entry(&mut file, entry)?);
            if dimensions != Some((size, size)) {
                return Err(ExportError::template(format!(
                    "{path} should be {size}x{size} pixels, found {dimensions:?}."
                )));
            }
            images.push(ImageSlotDescriptor {
                entry: path,
                kind,
                size,
            });
        }
    }
    images.sort_by(|a, b| a.entry.cmp(&b.entry));

    let abis: Vec<String> = index
        .entries
        .iter()
        .filter_map(|entry| entry.name.strip_prefix("lib/"))
        .filter_map(|rest| rest.split_once('/').map(|(abi, _)| abi.to_string()))
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();

    Ok(TemplateDescriptor {
        format_version: DESCRIPTOR_FORMAT_VERSION,
        template_version_name: facts.version_name,
        template_version_code: facts.version_code,
        template_application_id: TEMPLATE_APPLICATION_ID.to_string(),
        min_sdk: facts.min_sdk,
        target_sdk: facts.target_sdk,
        abis,
        application_id_strings,
        components: facts.components,
        images,
        colors,
        sha256: sha256_file(apk_path)?,
    })
}

/// Checks the alignment and compression rules Android enforces.
pub fn check_alignment(index: &ZipIndex) -> Result<()> {
    for entry in &index.entries {
        let is_library = entry.name.starts_with("lib/") && entry.name.ends_with(".so");
        if is_library && !entry.is_stored() {
            return Err(ExportError::validation(format!(
                "{} must be stored uncompressed.",
                entry.name
            )));
        }
        if entry.is_stored() && entry.data_offset % zip::required_alignment(&entry.name) != 0 {
            return Err(ExportError::validation(format!(
                "{} is not aligned to {} bytes.",
                entry.name,
                zip::required_alignment(&entry.name)
            )));
        }
    }
    Ok(())
}

/// Loads a descriptor and checks it matches the template file.
pub fn load_descriptor(template_path: &Path, descriptor_path: &Path) -> Result<TemplateDescriptor> {
    let text = std::fs::read_to_string(descriptor_path)
        .map_err(|error| missing(descriptor_path, error))?;
    let descriptor: TemplateDescriptor = serde_json::from_str(&text).map_err(|error| {
        ExportError::template(format!("The template descriptor is invalid: {error}"))
    })?;
    if descriptor.format_version != DESCRIPTOR_FORMAT_VERSION {
        return Err(ExportError::template(format!(
            "Unsupported template descriptor version {}.",
            descriptor.format_version
        )));
    }
    if descriptor.template_application_id != TEMPLATE_APPLICATION_ID {
        return Err(ExportError::template(
            "The template descriptor names another application.",
        ));
    }
    let actual = sha256_file(template_path)?;
    if actual != descriptor.sha256 {
        return Err(ExportError::template(
            "The Android player template does not match its descriptor.",
        ));
    }
    Ok(descriptor)
}
