use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MacosExportHostCapabilities {
    host_supported: bool,
    ditto_available: bool,
    codesign_available: bool,
    sips_available: bool,
    iconutil_available: bool,
    lipo_available: bool,
    available: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportMacosApplicationResult {
    output_path: String,
    package_bin_bytes: u64,
    encrypted_payload_bytes: u64,
    stats: routevn_exporter::PackageBinExportStats,
}

#[tauri::command]
pub fn get_macos_export_host_capabilities() -> MacosExportHostCapabilities {
    let host_supported = cfg!(target_os = "macos");
    let ditto_available = host_supported && std::path::Path::new("/usr/bin/ditto").is_file();
    let codesign_available = host_supported && std::path::Path::new("/usr/bin/codesign").is_file();
    let sips_available = host_supported && std::path::Path::new("/usr/bin/sips").is_file();
    let iconutil_available = host_supported && std::path::Path::new("/usr/bin/iconutil").is_file();
    let lipo_available = host_supported && std::path::Path::new("/usr/bin/lipo").is_file();
    let available = host_supported
        && ditto_available
        && codesign_available
        && sips_available
        && iconutil_available
        && lipo_available;

    MacosExportHostCapabilities {
        host_supported,
        ditto_available,
        codesign_available,
        sips_available,
        iconutil_available,
        lipo_available,
        available,
    }
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn export_macos_application(
    template_path: String,
    output_path: String,
    assets: Vec<routevn_exporter::ZipAssetInput>,
    instructions_json: String,
    title: String,
    short_version: String,
    bundle_version: String,
    application_identifier: String,
    icon_png: Vec<u8>,
) -> Result<ExportMacosApplicationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        export_macos_application_sync(
            template_path,
            output_path,
            assets,
            instructions_json,
            title,
            short_version,
            bundle_version,
            application_identifier,
            icon_png,
        )
    })
    .await
    .map_err(|error| format!("Failed to run macOS application export task: {error}"))?
}

#[cfg(not(target_os = "macos"))]
#[allow(clippy::too_many_arguments)]
fn export_macos_application_sync(
    _template_path: String,
    _output_path: String,
    _assets: Vec<routevn_exporter::ZipAssetInput>,
    _instructions_json: String,
    _title: String,
    _short_version: String,
    _bundle_version: String,
    _application_identifier: String,
    _icon_png: Vec<u8>,
) -> Result<ExportMacosApplicationResult, String> {
    Err(format!(
        "macOS application export is supported only on macOS hosts; current host is {}.",
        std::env::consts::OS
    ))
}

#[cfg(target_os = "macos")]
mod macos {
    use std::collections::BTreeSet;
    use std::ffi::OsString;
    use std::fs;
    use std::io::Read;
    use std::os::unix::fs::PermissionsExt;
    use std::path::{Component, Path, PathBuf};
    use std::process::{Command, Output};

    use super::ExportMacosApplicationResult;

    const TEMPLATE_APP_NAME: &str = "RouteVNPlayerTemplate.app";
    const PACKAGE_RESOURCE_NAME: &str = "routevn-package.bin";
    const ICON_RESOURCE_NAME: &str = "icon.icns";

    struct MacosApplicationMetadata {
        title: String,
        short_version: String,
        bundle_version: String,
        application_identifier: String,
    }

    pub(super) fn export_macos_application_sync(
        template_path: String,
        output_path: String,
        assets: Vec<routevn_exporter::ZipAssetInput>,
        instructions_json: String,
        title: String,
        short_version: String,
        bundle_version: String,
        application_identifier: String,
        icon_png: Vec<u8>,
    ) -> Result<ExportMacosApplicationResult, String> {
        let metadata = MacosApplicationMetadata {
            title,
            short_version,
            bundle_version,
            application_identifier,
        };
        validate_metadata(&metadata)?;
        ensure_required_tools()?;

        if icon_png.is_empty() {
            return Err("A project icon is required for macOS application export.".to_string());
        }

        let template_path = PathBuf::from(template_path);
        if !template_path.is_file() {
            return Err(format!(
                "The macOS player template is missing: {}.",
                template_path.display()
            ));
        }

        let output_path = PathBuf::from(output_path);
        if output_path.extension().and_then(|value| value.to_str()) != Some("zip") {
            return Err("The macOS application export path must end in .zip.".to_string());
        }
        let output_parent = output_path
            .parent()
            .ok_or_else(|| "The macOS application export folder is required.".to_string())?;
        fs::create_dir_all(output_parent).map_err(|error| {
            format!(
                "Failed to create the macOS application export folder {}: {error}",
                output_parent.display()
            )
        })?;

        let temp = tempfile::tempdir()
            .map_err(|error| format!("Failed to create a macOS export workspace: {error}"))?;
        let extract_directory = temp.path().join("template");
        fs::create_dir_all(&extract_directory)
            .map_err(|error| format!("Failed to prepare the macOS template workspace: {error}"))?;
        run_tool(
            "/usr/bin/ditto",
            [
                OsString::from("-x"),
                OsString::from("-k"),
                OsString::from("--noqtn"),
                template_path.as_os_str().to_os_string(),
                extract_directory.as_os_str().to_os_string(),
            ],
            "expand the macOS player template",
        )?;

        let template_app_path = require_single_application(&extract_directory)?;
        if template_app_path
            .file_name()
            .and_then(|value| value.to_str())
            != Some(TEMPLATE_APP_NAME)
        {
            return Err(format!(
                "The macOS player template must contain exactly {TEMPLATE_APP_NAME}."
            ));
        }
        validate_bundle_symlinks(&template_app_path)?;
        validate_universal_macho_files(&template_app_path)?;
        strip_application_signatures_inside_out(&template_app_path)?;

        let application_name = sanitize_application_name(&metadata.title)?;
        let application_path = extract_directory.join(format!("{application_name}.app"));
        fs::rename(&template_app_path, &application_path).map_err(|error| {
            format!(
                "Failed to name the exported macOS application {}: {error}",
                application_path.display()
            )
        })?;

        stamp_info_plist(&application_path, &metadata, &application_name)?;
        stamp_icon(&application_path, &icon_png, temp.path())?;

        let package_bin = routevn_exporter::create_package_bin(assets, instructions_json)
            .map_err(|error| format!("Failed to create RouteVN package payload: {error}"))?;
        let package_bin_bytes = package_bin.package_bin.len() as u64;
        let package_resource_path = application_path
            .join("Contents")
            .join("Resources")
            .join(PACKAGE_RESOURCE_NAME);
        let (key, nonce) = routevn_packager::payload::generate_payload_key_material();
        let payload_outcome =
            routevn_packager::payload::write_standalone_chunked_encrypted_payload(
                routevn_packager::payload::WriteStandaloneChunkedPayloadRequest {
                    output_path: &package_resource_path,
                    payload: &package_bin.package_bin,
                    key,
                    nonce,
                    chunk_size: routevn_packager::payload::DEFAULT_PAYLOAD_CHUNK_SIZE,
                },
            )
            .map_err(|error| format!("Failed to encrypt the macOS player payload: {error}"))?;

        sign_application_inside_out(&application_path)?;
        verify_application(&application_path, &metadata)?;

        let part_path = part_path_for(&output_path);
        if part_path.exists() {
            fs::remove_file(&part_path).map_err(|error| {
                format!(
                    "Failed to replace the temporary macOS export {}: {error}",
                    part_path.display()
                )
            })?;
        }
        run_tool(
            "/usr/bin/ditto",
            [
                OsString::from("-c"),
                OsString::from("-k"),
                OsString::from("--keepParent"),
                OsString::from("--norsrc"),
                OsString::from("--noextattr"),
                OsString::from("--noqtn"),
                OsString::from("--noacl"),
                application_path.as_os_str().to_os_string(),
                part_path.as_os_str().to_os_string(),
            ],
            "archive the macOS application",
        )?;
        verify_archive(&part_path, &metadata, temp.path())?;

        fs::rename(&part_path, &output_path).map_err(|error| {
            format!(
                "Failed to finalize the macOS application export {}: {error}",
                output_path.display()
            )
        })?;

        Ok(ExportMacosApplicationResult {
            output_path: output_path.display().to_string(),
            package_bin_bytes,
            encrypted_payload_bytes: payload_outcome.footer.encrypted_len,
            stats: package_bin.stats,
        })
    }

    fn validate_metadata(metadata: &MacosApplicationMetadata) -> Result<(), String> {
        if metadata.title.trim().is_empty() {
            return Err("A project title is required for macOS application export.".to_string());
        }
        if !is_valid_application_identifier(&metadata.application_identifier) {
            return Err("The project native application identifier is invalid.".to_string());
        }
        if !is_numeric_version(&metadata.short_version, 3) {
            return Err(
                "The macOS short version must contain three numeric components.".to_string(),
            );
        }
        if !is_numeric_version(&metadata.bundle_version, 1) {
            return Err("The macOS bundle version must be a positive integer.".to_string());
        }
        Ok(())
    }

    fn is_valid_application_identifier(value: &str) -> bool {
        !value.is_empty()
            && value.split('.').count() > 1
            && value.split('.').all(|segment| {
                !segment.is_empty()
                    && segment
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
            })
    }

    fn is_numeric_version(value: &str, component_count: usize) -> bool {
        let components = value.split('.').collect::<Vec<_>>();
        components.len() == component_count
            && components.iter().all(|component| {
                !component.is_empty() && component.bytes().all(|b| b.is_ascii_digit())
            })
            && components
                .last()
                .and_then(|component| component.parse::<u64>().ok())
                .is_some_and(|component| component > 0 || component_count > 1)
    }

    fn ensure_required_tools() -> Result<(), String> {
        let capabilities = super::get_macos_export_host_capabilities();
        if capabilities.available {
            return Ok(());
        }

        let mut missing = Vec::new();
        if !capabilities.ditto_available {
            missing.push("ditto");
        }
        if !capabilities.codesign_available {
            missing.push("codesign");
        }
        if !capabilities.sips_available {
            missing.push("sips");
        }
        if !capabilities.iconutil_available {
            missing.push("iconutil");
        }
        if !capabilities.lipo_available {
            missing.push("lipo");
        }
        Err(format!(
            "macOS application export requires these host tools: {}.",
            missing.join(", ")
        ))
    }

    fn sanitize_application_name(value: &str) -> Result<String, String> {
        let sanitized: String = value
            .chars()
            .map(|character| match character {
                '/' | ':' => '_',
                character if character.is_control() => '_',
                character => character,
            })
            .collect();
        let trimmed = sanitized.trim().trim_matches('.');
        if trimmed.is_empty() {
            return Err(
                "The project title must contain a valid macOS application filename character."
                    .to_string(),
            );
        }
        Ok(trimmed.chars().take(120).collect())
    }

    fn require_single_application(directory: &Path) -> Result<PathBuf, String> {
        let entries = fs::read_dir(directory)
            .map_err(|error| format!("Failed to inspect the macOS player template: {error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("Failed to inspect the macOS player template: {error}"))?;
        if entries.len() != 1 {
            return Err(
                "The macOS player template archive must contain exactly one application."
                    .to_string(),
            );
        }
        let path = entries[0].path();
        if !path.is_dir() || path.extension().and_then(|value| value.to_str()) != Some("app") {
            return Err(
                "The macOS player template archive must contain exactly one application."
                    .to_string(),
            );
        }
        Ok(path)
    }

    fn validate_bundle_symlinks(application_path: &Path) -> Result<(), String> {
        let canonical_application = application_path.canonicalize().map_err(|error| {
            format!(
                "Failed to resolve the macOS application bundle {}: {error}",
                application_path.display()
            )
        })?;
        visit_paths(application_path, &mut |path, file_type| {
            if !file_type.is_symlink() {
                return Ok(());
            }
            let target = fs::read_link(path).map_err(|error| {
                format!(
                    "Failed to inspect bundle symlink {}: {error}",
                    path.display()
                )
            })?;
            if target.is_absolute()
                || target
                    .components()
                    .any(|component| component == Component::RootDir)
            {
                return Err(format!(
                    "The macOS player template contains an unsafe symlink: {}.",
                    path.display()
                ));
            }
            let resolved = path
                .parent()
                .unwrap_or(application_path)
                .join(target)
                .canonicalize()
                .map_err(|error| {
                    format!(
                        "Failed to resolve bundle symlink {}: {error}",
                        path.display()
                    )
                })?;
            if !resolved.starts_with(&canonical_application) {
                return Err(format!(
                    "The macOS player template contains a symlink that escapes the application bundle: {}.",
                    path.display()
                ));
            }
            Ok(())
        })
    }

    fn stamp_info_plist(
        application_path: &Path,
        metadata: &MacosApplicationMetadata,
        application_name: &str,
    ) -> Result<(), String> {
        let info_path = application_path.join("Contents").join("Info.plist");
        let mut info = plist::Value::from_file(&info_path)
            .map_err(|error| format!("Failed to read the macOS player Info.plist: {error}"))?;
        let dictionary = info
            .as_dictionary_mut()
            .ok_or_else(|| "The macOS player Info.plist is not a dictionary.".to_string())?;
        dictionary.insert(
            "CFBundleDisplayName".to_string(),
            plist::Value::String(metadata.title.trim().to_string()),
        );
        dictionary.insert(
            "CFBundleName".to_string(),
            plist::Value::String(application_name.to_string()),
        );
        dictionary.insert(
            "CFBundleIdentifier".to_string(),
            plist::Value::String(metadata.application_identifier.clone()),
        );
        dictionary.insert(
            "CFBundleShortVersionString".to_string(),
            plist::Value::String(metadata.short_version.clone()),
        );
        dictionary.insert(
            "CFBundleVersion".to_string(),
            plist::Value::String(metadata.bundle_version.clone()),
        );
        dictionary.insert(
            "CFBundleIconFile".to_string(),
            plist::Value::String(ICON_RESOURCE_NAME.to_string()),
        );
        info.to_file_xml(&info_path)
            .map_err(|error| format!("Failed to write the macOS player Info.plist: {error}"))
    }

    fn stamp_icon(
        application_path: &Path,
        icon_png: &[u8],
        temp_path: &Path,
    ) -> Result<(), String> {
        let source_path = temp_path.join("project-icon.png");
        fs::write(&source_path, icon_png)
            .map_err(|error| format!("Failed to stage the macOS application icon: {error}"))?;
        let iconset_path = temp_path.join("RouteVNPlayer.iconset");
        fs::create_dir_all(&iconset_path)
            .map_err(|error| format!("Failed to prepare the macOS icon set: {error}"))?;
        let icons = [
            (16, "icon_16x16.png"),
            (32, "icon_16x16@2x.png"),
            (32, "icon_32x32.png"),
            (64, "icon_32x32@2x.png"),
            (128, "icon_128x128.png"),
            (256, "icon_128x128@2x.png"),
            (256, "icon_256x256.png"),
            (512, "icon_256x256@2x.png"),
            (512, "icon_512x512.png"),
            (1024, "icon_512x512@2x.png"),
        ];
        for (size, filename) in icons {
            let destination = iconset_path.join(filename);
            run_tool(
                "/usr/bin/sips",
                [
                    OsString::from("-z"),
                    OsString::from(size.to_string()),
                    OsString::from(size.to_string()),
                    source_path.as_os_str().to_os_string(),
                    OsString::from("--out"),
                    destination.as_os_str().to_os_string(),
                ],
                "render the macOS application icon",
            )?;
        }

        let icon_path = application_path
            .join("Contents")
            .join("Resources")
            .join(ICON_RESOURCE_NAME);
        let compiled_icon_path = temp_path.join("RouteVNPlayer.icns");
        if compiled_icon_path.exists() {
            fs::remove_file(&compiled_icon_path).map_err(|error| {
                format!("Failed to prepare the macOS application icon: {error}")
            })?;
        }
        let iconutil_result = run_tool(
            "/usr/bin/iconutil",
            [
                OsString::from("-c"),
                OsString::from("icns"),
                iconset_path.as_os_str().to_os_string(),
            ],
            "compile the macOS application icon",
        );
        if iconutil_result.is_err() {
            run_tool(
                "/usr/bin/sips",
                [
                    OsString::from("-s"),
                    OsString::from("format"),
                    OsString::from("icns"),
                    source_path.as_os_str().to_os_string(),
                    OsString::from("--out"),
                    compiled_icon_path.as_os_str().to_os_string(),
                ],
                "compile the macOS application icon fallback",
            )?;
        }
        if icon_path.exists() {
            fs::remove_file(&icon_path).map_err(|error| {
                format!("Failed to replace the macOS application icon: {error}")
            })?;
        }
        fs::rename(&compiled_icon_path, &icon_path)
            .map_err(|error| format!("Failed to install the macOS application icon: {error}"))
    }

    fn validate_universal_macho_files(application_path: &Path) -> Result<(), String> {
        let mut macho_files = Vec::new();
        visit_paths(application_path, &mut |path, file_type| {
            if file_type.is_file() && is_macho_file(path)? {
                macho_files.push(path.to_path_buf());
            }
            Ok(())
        })?;
        if macho_files.is_empty() {
            return Err(
                "The macOS player template does not contain a Mach-O executable.".to_string(),
            );
        }

        for path in macho_files {
            let output = run_tool_output(
                "/usr/bin/lipo",
                [OsString::from("-archs"), path.as_os_str().to_os_string()],
                "inspect macOS player architectures",
            )?;
            let architectures = String::from_utf8_lossy(&output.stdout);
            let architectures = architectures.split_whitespace().collect::<BTreeSet<_>>();
            if !architectures.contains("arm64") || !architectures.contains("x86_64") {
                return Err(format!(
                    "The macOS player template is not universal: {}.",
                    path.display()
                ));
            }
        }
        Ok(())
    }

    fn collect_nested_code_paths(
        application_path: &Path,
    ) -> Result<(Vec<PathBuf>, Vec<PathBuf>), String> {
        let main_executable = read_main_executable_path(application_path)?;
        let mut macho_files = Vec::new();
        let mut nested_bundles = Vec::new();
        visit_paths(application_path, &mut |path, file_type| {
            if file_type.is_file() && path != main_executable && is_macho_file(path)? {
                macho_files.push(path.to_path_buf());
            }
            if file_type.is_dir() && path != application_path && is_code_bundle(path) {
                nested_bundles.push(path.to_path_buf());
            }
            Ok(())
        })?;
        macho_files.sort_by_key(|path| std::cmp::Reverse(path.components().count()));
        nested_bundles.sort_by_key(|path| std::cmp::Reverse(path.components().count()));
        Ok((macho_files, nested_bundles))
    }

    fn strip_application_signatures_inside_out(application_path: &Path) -> Result<(), String> {
        let (macho_files, nested_bundles) = collect_nested_code_paths(application_path)?;
        for path in macho_files {
            remove_signature(&path)?;
        }
        for path in nested_bundles {
            remove_signature(&path)?;
        }
        remove_signature(application_path)
    }

    fn remove_signature(path: &Path) -> Result<(), String> {
        run_tool(
            "/usr/bin/codesign",
            [
                OsString::from("--remove-signature"),
                path.as_os_str().to_os_string(),
            ],
            "remove the macOS player template signature",
        )
    }

    fn sign_application_inside_out(application_path: &Path) -> Result<(), String> {
        let (macho_files, nested_bundles) = collect_nested_code_paths(application_path)?;
        for path in macho_files {
            codesign(&path)?;
        }
        for path in nested_bundles {
            codesign(&path)?;
        }
        codesign(application_path)
    }

    fn codesign(path: &Path) -> Result<(), String> {
        run_tool(
            "/usr/bin/codesign",
            [
                OsString::from("--force"),
                OsString::from("--sign"),
                OsString::from("-"),
                OsString::from("--timestamp=none"),
                path.as_os_str().to_os_string(),
            ],
            "ad-hoc sign the macOS application",
        )
    }

    fn verify_application(
        application_path: &Path,
        metadata: &MacosApplicationMetadata,
    ) -> Result<(), String> {
        validate_bundle_symlinks(application_path)?;
        validate_universal_macho_files(application_path)?;
        let executable_path = read_main_executable_path(application_path)?;
        let mode = fs::metadata(&executable_path)
            .map_err(|error| {
                format!(
                    "Failed to inspect the macOS player executable {}: {error}",
                    executable_path.display()
                )
            })?
            .permissions()
            .mode();
        if mode & 0o111 == 0 {
            return Err("The exported macOS player executable is not executable.".to_string());
        }
        verify_info_plist(application_path, metadata)?;
        run_tool(
            "/usr/bin/codesign",
            [
                OsString::from("--verify"),
                OsString::from("--all-architectures"),
                OsString::from("--strict"),
                OsString::from("--verbose=2"),
                application_path.as_os_str().to_os_string(),
            ],
            "verify the macOS application signature",
        )?;
        verify_ad_hoc_signatures(application_path)
    }

    fn verify_ad_hoc_signatures(application_path: &Path) -> Result<(), String> {
        const DEVELOPER_ID_MARKER: &[u8] = b"Developer ID Application:";

        let mut macho_files = Vec::new();
        visit_paths(application_path, &mut |path, file_type| {
            if file_type.is_file() && is_macho_file(path)? {
                macho_files.push(path.to_path_buf());
            }
            Ok(())
        })?;

        for path in macho_files {
            let bytes = fs::read(&path).map_err(|error| {
                format!(
                    "Failed to inspect the exported macOS player signature {}: {error}",
                    path.display()
                )
            })?;
            if bytes
                .windows(DEVELOPER_ID_MARKER.len())
                .any(|window| window == DEVELOPER_ID_MARKER)
            {
                return Err(format!(
                    "The exported macOS player retains Developer ID signature data: {}.",
                    path.display()
                ));
            }

            for architecture in ["x86_64", "arm64"] {
                let output = run_tool_output(
                    "/usr/bin/codesign",
                    [
                        OsString::from("-dvvv"),
                        OsString::from("--arch"),
                        OsString::from(architecture),
                        path.as_os_str().to_os_string(),
                    ],
                    "inspect the exported macOS player signature",
                )?;
                let details = format!(
                    "{}\n{}",
                    String::from_utf8_lossy(&output.stdout),
                    String::from_utf8_lossy(&output.stderr)
                );
                let is_ad_hoc = details.lines().any(|line| line.trim() == "Signature=adhoc");
                let has_no_team = details
                    .lines()
                    .any(|line| line.trim() == "TeamIdentifier=not set");
                let has_authority = details
                    .lines()
                    .any(|line| line.trim_start().starts_with("Authority="));
                if !is_ad_hoc || !has_no_team || has_authority {
                    return Err(format!(
                        "The exported macOS player is not exclusively ad-hoc signed for {architecture}: {}.",
                        path.display()
                    ));
                }
            }
        }
        Ok(())
    }

    fn verify_info_plist(
        application_path: &Path,
        metadata: &MacosApplicationMetadata,
    ) -> Result<(), String> {
        let info_path = application_path.join("Contents").join("Info.plist");
        let info = plist::Value::from_file(&info_path)
            .map_err(|error| format!("Failed to verify the macOS player Info.plist: {error}"))?;
        let dictionary = info
            .as_dictionary()
            .ok_or_else(|| "The exported macOS player Info.plist is invalid.".to_string())?;
        let expected = [
            (
                "CFBundleIdentifier",
                metadata.application_identifier.as_str(),
            ),
            (
                "CFBundleShortVersionString",
                metadata.short_version.as_str(),
            ),
            ("CFBundleVersion", metadata.bundle_version.as_str()),
        ];
        for (key, expected_value) in expected {
            let value = dictionary.get(key).and_then(plist::Value::as_string);
            if value != Some(expected_value) {
                return Err(format!("The exported macOS player has an invalid {key}."));
            }
        }
        Ok(())
    }

    fn read_main_executable_path(application_path: &Path) -> Result<PathBuf, String> {
        let info_path = application_path.join("Contents").join("Info.plist");
        let info = plist::Value::from_file(&info_path)
            .map_err(|error| format!("Failed to read the macOS player Info.plist: {error}"))?;
        let executable = info
            .as_dictionary()
            .and_then(|dictionary| dictionary.get("CFBundleExecutable"))
            .and_then(plist::Value::as_string)
            .ok_or_else(|| "The macOS player is missing CFBundleExecutable.".to_string())?;
        Ok(application_path
            .join("Contents")
            .join("MacOS")
            .join(executable))
    }

    fn verify_archive(
        archive_path: &Path,
        metadata: &MacosApplicationMetadata,
        temp_path: &Path,
    ) -> Result<(), String> {
        let verify_directory = temp_path.join("verify-archive");
        fs::create_dir_all(&verify_directory)
            .map_err(|error| format!("Failed to prepare macOS archive verification: {error}"))?;
        run_tool(
            "/usr/bin/ditto",
            [
                OsString::from("-x"),
                OsString::from("-k"),
                OsString::from("--noqtn"),
                archive_path.as_os_str().to_os_string(),
                verify_directory.as_os_str().to_os_string(),
            ],
            "verify the macOS application archive",
        )?;
        let application_path = require_single_application(&verify_directory)?;
        verify_application(&application_path, metadata)
    }

    fn is_code_bundle(path: &Path) -> bool {
        matches!(
            path.extension().and_then(|value| value.to_str()),
            Some("app" | "framework" | "xpc" | "appex" | "bundle" | "plugin")
        )
    }

    fn is_macho_file(path: &Path) -> Result<bool, String> {
        let mut file = fs::File::open(path).map_err(|error| {
            format!("Failed to inspect native file {}: {error}", path.display())
        })?;
        let mut magic = [0u8; 4];
        if file
            .read(&mut magic)
            .map_err(|error| format!("Failed to inspect native file {}: {error}", path.display()))?
            < magic.len()
        {
            return Ok(false);
        }
        Ok(matches!(
            magic,
            [0xfe, 0xed, 0xfa, 0xce]
                | [0xce, 0xfa, 0xed, 0xfe]
                | [0xfe, 0xed, 0xfa, 0xcf]
                | [0xcf, 0xfa, 0xed, 0xfe]
                | [0xca, 0xfe, 0xba, 0xbe]
                | [0xbe, 0xba, 0xfe, 0xca]
                | [0xca, 0xfe, 0xba, 0xbf]
                | [0xbf, 0xba, 0xfe, 0xca]
        ))
    }

    fn visit_paths(
        directory: &Path,
        visitor: &mut impl FnMut(&Path, fs::FileType) -> Result<(), String>,
    ) -> Result<(), String> {
        for entry in fs::read_dir(directory)
            .map_err(|error| format!("Failed to inspect {}: {error}", directory.display()))?
        {
            let entry = entry
                .map_err(|error| format!("Failed to inspect {}: {error}", directory.display()))?;
            let path = entry.path();
            let file_type = entry.file_type().map_err(|error| {
                format!("Failed to inspect bundle entry {}: {error}", path.display())
            })?;
            visitor(&path, file_type)?;
            if file_type.is_dir() {
                visit_paths(&path, visitor)?;
            }
        }
        Ok(())
    }

    fn part_path_for(output_path: &Path) -> PathBuf {
        let mut value = output_path.as_os_str().to_os_string();
        value.push(".part");
        PathBuf::from(value)
    }

    fn run_tool<const N: usize>(
        command: &str,
        args: [OsString; N],
        action: &str,
    ) -> Result<(), String> {
        run_tool_output(command, args, action).map(|_| ())
    }

    fn run_tool_output<const N: usize>(
        command: &str,
        args: [OsString; N],
        action: &str,
    ) -> Result<Output, String> {
        let output = Command::new(command)
            .args(args)
            .output()
            .map_err(|error| format!("Failed to {action}: {error}"))?;
        if output.status.success() {
            return Ok(output);
        }

        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            Err(format!("Failed to {action}."))
        } else {
            Err(format!("Failed to {action}: {stderr}"))
        }
    }

    #[cfg(test)]
    mod tests {
        use std::path::{Path, PathBuf};

        use super::{
            MacosApplicationMetadata, export_macos_application_sync,
            is_valid_application_identifier, sanitize_application_name, stamp_icon,
            validate_metadata,
        };

        #[test]
        fn sanitizes_macos_application_names() {
            assert_eq!(
                sanitize_application_name(" My/Game: Demo ").unwrap(),
                "My_Game_ Demo"
            );
            assert!(sanitize_application_name("... ").is_err());
        }

        #[test]
        fn validates_native_application_identifiers() {
            assert!(is_valid_application_identifier("vn.routevn.player.abc-123"));
            assert!(!is_valid_application_identifier(
                "vn.routevn.player.bad_value"
            ));
        }

        #[test]
        fn validates_export_versions() {
            assert!(
                validate_metadata(&MacosApplicationMetadata {
                    title: "Game".to_string(),
                    short_version: "1.0.7".to_string(),
                    bundle_version: "8".to_string(),
                    application_identifier: "vn.routevn.player.abc".to_string(),
                })
                .is_ok()
            );
        }

        #[test]
        fn compiles_project_png_into_an_application_icon() {
            let temp = tempfile::tempdir().unwrap();
            let application_path = temp.path().join("Icon Test.app");
            std::fs::create_dir_all(application_path.join("Contents/Resources")).unwrap();
            let icon_png = include_bytes!("../icons/128x128.png");
            if let Err(error) = stamp_icon(&application_path, icon_png, temp.path()) {
                let kept_path = temp.keep();
                panic!("{error}; workspace: {}", kept_path.display());
            }
            assert!(
                application_path
                    .join("Contents/Resources/icon.icns")
                    .is_file()
            );
        }

        #[test]
        fn exports_and_verifies_a_real_universal_application_archive() {
            let manifest_directory = Path::new(env!("CARGO_MANIFEST_DIR"));
            let template_path = std::env::var_os("ROUTEVN_MACOS_TEST_TEMPLATE_PATH")
                .map(PathBuf::from)
                .unwrap_or_else(|| {
                    manifest_directory
                        .join("assets/player-templates/macos/RouteVNPlayerTemplate.app.zip")
                });
            assert!(template_path.is_file());
            let temp = tempfile::tempdir().unwrap();
            let output_path = temp.path().join("Acceptance Game.app.zip");
            let icon_png = include_bytes!("../icons/128x128.png").to_vec();
            let application_identifier =
                format!("vn.routevn.player.acceptance-{}", std::process::id());

            let result = export_macos_application_sync(
                template_path.display().to_string(),
                output_path.display().to_string(),
                Vec::new(),
                r#"{"projectData":{"screen":{"width":1280,"height":720},"story":{"initialSceneId":"scene-1","scenes":{"scene-1":{"initialSectionId":"section-1","sections":{"section-1":{"lines":[]}}}}}},"bundleMetadata":{"project":{"namespace":"acceptance"}}}"#.to_string(),
                "Acceptance Game".to_string(),
                "1.0.7".to_string(),
                "8".to_string(),
                application_identifier.clone(),
                icon_png,
            )
            .unwrap();

            assert_eq!(result.output_path, output_path.display().to_string());
            assert!(output_path.is_file());
            assert!(result.package_bin_bytes > 0);
            assert!(result.encrypted_payload_bytes > 0);

            let launch_directory = temp.path().join("launch");
            std::fs::create_dir_all(&launch_directory).unwrap();
            let ditto_status = std::process::Command::new("/usr/bin/ditto")
                .args(["-x", "-k"])
                .arg(&output_path)
                .arg(&launch_directory)
                .status()
                .unwrap();
            assert!(ditto_status.success());
            let application_path = launch_directory.join("Acceptance Game.app");
            let info =
                plist::Value::from_file(application_path.join("Contents/Info.plist")).unwrap();
            let identifier = info
                .as_dictionary()
                .and_then(|dictionary| dictionary.get("CFBundleIdentifier"))
                .and_then(plist::Value::as_string)
                .unwrap();
            assert_eq!(identifier, application_identifier);
            let mut launcher = std::process::Command::new("/usr/bin/open")
                .args(["-W", "-n"])
                .arg(&application_path)
                .spawn()
                .unwrap();
            std::thread::sleep(std::time::Duration::from_secs(2));
            assert!(
                launcher.try_wait().unwrap().is_none(),
                "The exported macOS player exited during startup."
            );
            let runtime_database_path = Path::new(&std::env::var("HOME").unwrap())
                .join("Library/Application Support")
                .join(&application_identifier)
                .join("runtime.db");
            assert!(
                runtime_database_path.is_file(),
                "The exported macOS player did not create its identity-scoped runtime database."
            );
            let quit_script = format!("tell application id \"{application_identifier}\" to quit");
            let quit_status = std::process::Command::new("/usr/bin/osascript")
                .args(["-e", &quit_script])
                .status()
                .unwrap();
            assert!(quit_status.success());
            assert!(launcher.wait().unwrap().success());
            std::fs::remove_dir_all(runtime_database_path.parent().unwrap()).unwrap();
        }
    }
}

#[cfg(target_os = "macos")]
use macos::export_macos_application_sync;
