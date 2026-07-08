use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StampWindowsExecutableResult {
    output_path: String,
    encrypted_payload_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportWindowsPortableExecutableResult {
    output_path: String,
    package_bin_bytes: u64,
    encrypted_payload_bytes: u64,
    stats: routevn_exporter::PackageBinExportStats,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportWindowsInstallerResult {
    output_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowsExportHostCapabilities {
    portable_executable: bool,
    installer: bool,
}

struct WindowsExecutableMetadata {
    title: String,
    version: String,
    publisher: Option<String>,
}

#[tauri::command]
pub fn get_windows_export_host_capabilities() -> WindowsExportHostCapabilities {
    WindowsExportHostCapabilities {
        portable_executable: true,
        installer: cfg!(target_os = "windows"),
    }
}

#[tauri::command]
pub async fn stamp_windows_executable(
    template_path: String,
    payload_path: String,
    output_path: String,
    title: String,
    version: String,
    publisher: Option<String>,
    icon_png: Vec<u8>,
    key_hex: Option<String>,
    nonce_hex: Option<String>,
) -> Result<StampWindowsExecutableResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        stamp_windows_executable_sync(
            template_path,
            payload_path,
            output_path,
            title,
            version,
            publisher,
            icon_png,
            key_hex,
            nonce_hex,
        )
    })
    .await
    .map_err(|error| format!("Failed to run Windows executable stamp task: {error}"))?
}

#[tauri::command]
pub async fn export_windows_portable_executable(
    template_path: String,
    output_path: String,
    assets: Vec<routevn_exporter::ZipAssetInput>,
    instructions_json: String,
    title: String,
    version: String,
    publisher: Option<String>,
    icon_png: Vec<u8>,
) -> Result<ExportWindowsPortableExecutableResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        export_windows_portable_executable_sync(
            template_path,
            output_path,
            assets,
            instructions_json,
            title,
            version,
            publisher,
            icon_png,
        )
    })
    .await
    .map_err(|error| format!("Failed to run Windows portable export task: {error}"))?
}

#[tauri::command]
pub async fn export_windows_installer(
    exe_path: String,
    output_path: String,
    title: String,
    version: String,
    publisher: Option<String>,
    makensis_path: Option<String>,
) -> Result<ExportWindowsInstallerResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        export_windows_installer_sync(
            exe_path,
            output_path,
            title,
            version,
            publisher,
            makensis_path,
        )
    })
    .await
    .map_err(|error| format!("Failed to run Windows installer export task: {error}"))?
}

#[tauri::command]
pub async fn export_windows_installer_from_project(
    template_path: String,
    output_path: String,
    assets: Vec<routevn_exporter::ZipAssetInput>,
    instructions_json: String,
    title: String,
    version: String,
    publisher: Option<String>,
    icon_png: Vec<u8>,
    makensis_path: Option<String>,
) -> Result<ExportWindowsInstallerResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        export_windows_installer_from_project_sync(
            template_path,
            output_path,
            assets,
            instructions_json,
            title,
            version,
            publisher,
            icon_png,
            makensis_path,
        )
    })
    .await
    .map_err(|error| format!("Failed to run Windows installer export task: {error}"))?
}

fn stamp_windows_executable_sync(
    template_path: String,
    payload_path: String,
    output_path: String,
    title: String,
    version: String,
    publisher: Option<String>,
    icon_png: Vec<u8>,
    key_hex: Option<String>,
    nonce_hex: Option<String>,
) -> Result<StampWindowsExecutableResult, String> {
    let metadata = WindowsExecutableMetadata {
        title,
        version,
        publisher,
    };
    validate_windows_executable_metadata(&metadata)?;
    let payload =
        std::fs::read(&payload_path).map_err(|error| format!("Failed to read payload: {error}"))?;
    let (key, nonce) = resolve_payload_key_material(key_hex, nonce_hex)?;
    let temp = tempfile::tempdir()
        .map_err(|error| format!("Failed to create temporary Windows stamp workspace: {error}"))?;
    let branded_template_path =
        stamp_branded_windows_template(&template_path, &output_path, &metadata, &icon_png, &temp)?;
    let outcome = routevn_packager::payload::append_chunked_encrypted_payload(
        routevn_packager::payload::AppendChunkedPayloadRequest {
            template_path: &branded_template_path,
            output_path: std::path::Path::new(&output_path),
            payload: &payload,
            key,
            nonce,
            chunk_size: routevn_packager::payload::DEFAULT_PAYLOAD_CHUNK_SIZE,
        },
    )
    .map_err(|e| e.to_string())?;

    Ok(StampWindowsExecutableResult {
        output_path: outcome.output_path.display().to_string(),
        encrypted_payload_bytes: outcome.footer.encrypted_len,
    })
}

fn export_windows_portable_executable_sync(
    template_path: String,
    output_path: String,
    assets: Vec<routevn_exporter::ZipAssetInput>,
    instructions_json: String,
    title: String,
    version: String,
    publisher: Option<String>,
    icon_png: Vec<u8>,
) -> Result<ExportWindowsPortableExecutableResult, String> {
    let metadata = WindowsExecutableMetadata {
        title,
        version,
        publisher,
    };
    validate_windows_executable_metadata(&metadata)?;
    let temp = tempfile::tempdir().map_err(|error| {
        format!("Failed to create temporary Windows portable export workspace: {error}")
    })?;
    let branded_template_path =
        stamp_branded_windows_template(&template_path, &output_path, &metadata, &icon_png, &temp)?;
    let package_bin = routevn_exporter::create_package_bin(assets, instructions_json)
        .map_err(|e| format!("Failed to create RouteVN package payload: {e}"))?;
    let package_bin_bytes = package_bin.package_bin.len() as u64;
    let (key, nonce) = routevn_packager::payload::generate_payload_key_material();
    let outcome = routevn_packager::payload::append_chunked_encrypted_payload(
        routevn_packager::payload::AppendChunkedPayloadRequest {
            template_path: &branded_template_path,
            output_path: std::path::Path::new(&output_path),
            payload: &package_bin.package_bin,
            key,
            nonce,
            chunk_size: routevn_packager::payload::DEFAULT_PAYLOAD_CHUNK_SIZE,
        },
    )
    .map_err(|e| e.to_string())?;

    Ok(ExportWindowsPortableExecutableResult {
        output_path: outcome.output_path.display().to_string(),
        package_bin_bytes,
        encrypted_payload_bytes: outcome.footer.encrypted_len,
        stats: package_bin.stats,
    })
}

fn export_windows_installer_sync(
    exe_path: String,
    output_path: String,
    title: String,
    version: String,
    publisher: Option<String>,
    makensis_path: Option<String>,
) -> Result<ExportWindowsInstallerResult, String> {
    let metadata = WindowsExecutableMetadata {
        title,
        version,
        publisher,
    };
    validate_windows_executable_metadata(&metadata)?;
    let makensis_path = makensis_path.map(std::path::PathBuf::from);
    let outcome = routevn_packager::installer::build_nsis_installer(
        routevn_packager::installer::InstallerRequest {
            exe_path: std::path::Path::new(&exe_path),
            output_path: std::path::Path::new(&output_path),
            title: &metadata.title,
            version: &metadata.version,
            publisher: metadata.publisher.as_deref(),
            makensis_path: makensis_path.as_deref(),
        },
    )
    .map_err(|e| e.to_string())?;

    Ok(ExportWindowsInstallerResult {
        output_path: outcome.output_path.display().to_string(),
    })
}

fn export_windows_installer_from_project_sync(
    template_path: String,
    output_path: String,
    assets: Vec<routevn_exporter::ZipAssetInput>,
    instructions_json: String,
    title: String,
    version: String,
    publisher: Option<String>,
    icon_png: Vec<u8>,
    makensis_path: Option<String>,
) -> Result<ExportWindowsInstallerResult, String> {
    if !cfg!(target_os = "windows") {
        return Err(format!(
            "Windows installer export is only supported on Windows hosts in v1; current host is {}",
            std::env::consts::OS
        ));
    }

    let metadata = WindowsExecutableMetadata {
        title,
        version,
        publisher,
    };
    validate_windows_executable_metadata(&metadata)?;
    let temp = tempfile::tempdir()
        .map_err(|error| format!("Failed to create temporary installer workspace: {error}"))?;
    let staged_exe_stem = sanitize_windows_file_stem(&metadata.title)?;
    let staged_exe_path = temp.path().join(format!("{}.exe", staged_exe_stem));
    let branded_template_path = stamp_branded_windows_template(
        &template_path,
        staged_exe_path.to_string_lossy().as_ref(),
        &metadata,
        &icon_png,
        &temp,
    )?;
    let package_bin = routevn_exporter::create_package_bin(assets, instructions_json)
        .map_err(|e| format!("Failed to create RouteVN package payload: {e}"))?;
    let (key, nonce) = routevn_packager::payload::generate_payload_key_material();
    routevn_packager::payload::append_chunked_encrypted_payload(
        routevn_packager::payload::AppendChunkedPayloadRequest {
            template_path: &branded_template_path,
            output_path: &staged_exe_path,
            payload: &package_bin.package_bin,
            key,
            nonce,
            chunk_size: routevn_packager::payload::DEFAULT_PAYLOAD_CHUNK_SIZE,
        },
    )
    .map_err(|e| e.to_string())?;

    let makensis_path = makensis_path.map(std::path::PathBuf::from);
    let outcome = routevn_packager::installer::build_nsis_installer(
        routevn_packager::installer::InstallerRequest {
            exe_path: &staged_exe_path,
            output_path: std::path::Path::new(&output_path),
            title: &metadata.title,
            version: &metadata.version,
            publisher: metadata.publisher.as_deref(),
            makensis_path: makensis_path.as_deref(),
        },
    )
    .map_err(|e| e.to_string())?;

    Ok(ExportWindowsInstallerResult {
        output_path: outcome.output_path.display().to_string(),
    })
}

fn resolve_payload_key_material(
    key_hex: Option<String>,
    nonce_hex: Option<String>,
) -> Result<
    (
        routevn_packager::payload::PayloadKey,
        routevn_packager::payload::PayloadNonce,
    ),
    String,
> {
    match (key_hex, nonce_hex) {
        (Some(key_hex), Some(nonce_hex)) => Ok((
            routevn_packager::payload::parse_payload_key_hex(&key_hex)
                .map_err(|e| e.to_string())?,
            routevn_packager::payload::parse_payload_nonce_hex(&nonce_hex)
                .map_err(|e| e.to_string())?,
        )),
        (None, None) => Ok(routevn_packager::payload::generate_payload_key_material()),
        _ => Err("keyHex and nonceHex must both be supplied, or neither".to_string()),
    }
}

fn sanitize_windows_file_stem(value: &str) -> Result<String, String> {
    let sanitized: String = value
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            character if character.is_control() => '_',
            character => character,
        })
        .collect();
    let trimmed = sanitized.trim().trim_end_matches(['.', ' ']);

    if trimmed.is_empty() {
        Err(
            "Windows executable title must contain at least one valid filename character."
                .to_string(),
        )
    } else {
        Ok(trimmed.to_string())
    }
}

fn stamp_branded_windows_template(
    template_path: &str,
    output_path: &str,
    metadata: &WindowsExecutableMetadata,
    icon_png: &[u8],
    temp: &tempfile::TempDir,
) -> Result<std::path::PathBuf, String> {
    validate_windows_executable_metadata(metadata)?;
    if icon_png.is_empty() {
        return Err("Windows executable icon is required.".to_string());
    }

    let original_filename = std::path::Path::new(output_path)
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Windows executable output file name is required.".to_string())?;
    let branded_template_path = temp.path().join("branded-template.exe");
    routevn_packager::windows_resources::stamp_windows_resources(
        routevn_packager::windows_resources::WindowsResourceStampRequest {
            template_path: std::path::Path::new(template_path),
            output_path: &branded_template_path,
            metadata: routevn_packager::windows_resources::WindowsResourceMetadata {
                title: &metadata.title,
                version: &metadata.version,
                publisher: metadata.publisher.as_deref(),
                original_filename,
            },
            icon_png,
        },
    )
    .map_err(|error| error.to_string())?;

    Ok(branded_template_path)
}

fn validate_windows_executable_metadata(
    metadata: &WindowsExecutableMetadata,
) -> Result<(), String> {
    if metadata.title.trim().is_empty() {
        return Err("Windows executable title is required.".to_string());
    }

    if metadata.version.trim().is_empty() {
        return Err("Windows executable version is required.".to_string());
    }

    let _publisher = metadata.publisher.as_deref().unwrap_or("").trim();

    Ok(())
}
