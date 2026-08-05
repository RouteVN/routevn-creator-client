use std::path::{Path, PathBuf};

use serde::Serialize;

mod windows_system_menu;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EmbeddedPackageInfo {
    byte_length: u64,
    chunk_size: u64,
    segment_count: u64,
}

fn resolve_embedded_package_path() -> Result<PathBuf, String> {
    let executable_path =
        std::env::current_exe().map_err(|error| format!("Failed to locate executable: {error}"))?;
    resolve_embedded_package_path_from_executable(&executable_path)
}

#[cfg(target_os = "windows")]
fn resolve_embedded_package_path_from_executable(
    executable_path: &Path,
) -> Result<PathBuf, String> {
    Ok(executable_path.to_path_buf())
}

#[cfg(target_os = "macos")]
fn resolve_embedded_package_path_from_executable(
    executable_path: &Path,
) -> Result<PathBuf, String> {
    let macos_directory = executable_path
        .parent()
        .ok_or_else(|| "Failed to locate the macOS application contents.".to_string())?;
    let contents_directory = macos_directory
        .parent()
        .ok_or_else(|| "Failed to locate the macOS application contents.".to_string())?;
    Ok(contents_directory
        .join("Resources")
        .join("routevn-package.bin"))
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn resolve_embedded_package_path_from_executable(
    _executable_path: &Path,
) -> Result<PathBuf, String> {
    Err("Embedded RouteVN packages are supported only on Windows and macOS.".to_string())
}

#[tauri::command]
fn get_embedded_package_info() -> Result<EmbeddedPackageInfo, String> {
    let package_path = resolve_embedded_package_path()?;
    let metadata =
        routevn_packager::payload::read_self_contained_embedded_payload_metadata(&package_path)
            .map_err(|error| error.to_string())?;

    Ok(EmbeddedPackageInfo {
        byte_length: metadata.plaintext_len,
        chunk_size: metadata.chunk_size,
        segment_count: metadata.segment_count,
    })
}

#[tauri::command]
fn read_embedded_package_range(offset: u64, length: u64) -> Result<Vec<u8>, String> {
    let package_path = resolve_embedded_package_path()?;
    routevn_packager::payload::read_self_contained_embedded_payload_range(
        &package_path,
        offset,
        length,
    )
    .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
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

#[cfg(target_os = "macos")]
#[derive(Debug, PartialEq, Eq)]
struct MacosApplicationMetadata {
    identifier: String,
    title: Option<String>,
    version: Option<String>,
}

#[cfg(target_os = "macos")]
fn parse_macos_application_metadata(
    dictionary: &plist::Dictionary,
) -> Result<MacosApplicationMetadata, String> {
    let identifier = dictionary
        .get("CFBundleIdentifier")
        .and_then(plist::Value::as_string)
        .ok_or_else(|| "The macOS application is missing CFBundleIdentifier.".to_string())?;

    if !is_valid_application_identifier(identifier) {
        return Err("The macOS application has an invalid CFBundleIdentifier.".to_string());
    }

    let title = dictionary
        .get("CFBundleDisplayName")
        .or_else(|| dictionary.get("CFBundleName"))
        .and_then(plist::Value::as_string)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "The macOS application is missing its display name.".to_string())?;
    let version = dictionary
        .get("CFBundleShortVersionString")
        .and_then(plist::Value::as_string)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "The macOS application is missing its version.".to_string())?;

    let version_components = version.split('.').collect::<Vec<_>>();
    if version_components.len() != 3
        || !version_components.iter().all(|component| {
            (*component == "0"
                || (!component.starts_with('0')
                    && component.bytes().all(|byte| byte.is_ascii_digit())))
                && component.parse::<u64>().is_ok()
        })
    {
        return Err("The macOS application has an invalid version.".to_string());
    }

    Ok(MacosApplicationMetadata {
        identifier: identifier.to_string(),
        title: Some(title.to_string()),
        version: Some(version.to_string()),
    })
}

#[cfg(target_os = "macos")]
fn read_macos_application_metadata(
    executable_path: &Path,
) -> Result<MacosApplicationMetadata, String> {
    if cfg!(debug_assertions) {
        if let Ok(identifier) = std::env::var("ROUTEVN_PLAYER_APPLICATION_IDENTIFIER") {
            if is_valid_application_identifier(&identifier) {
                return Ok(MacosApplicationMetadata {
                    identifier,
                    title: None,
                    version: None,
                });
            }
            return Err(
                "ROUTEVN_PLAYER_APPLICATION_IDENTIFIER is not a valid application identifier."
                    .to_string(),
            );
        }
    }

    let contents_directory = executable_path
        .parent()
        .and_then(Path::parent)
        .ok_or_else(|| "Failed to locate the macOS application Info.plist.".to_string())?;
    let info_plist_path = contents_directory.join("Info.plist");
    let info = plist::Value::from_file(&info_plist_path).map_err(|error| {
        format!(
            "Failed to read macOS application identity from {}: {error}",
            info_plist_path.display()
        )
    })?;
    let dictionary = info
        .as_dictionary()
        .ok_or_else(|| "The macOS application Info.plist is not a dictionary.".to_string())?;

    parse_macos_application_metadata(dictionary)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut context = tauri::generate_context!();

    #[cfg(target_os = "macos")]
    {
        let executable_path =
            std::env::current_exe().expect("failed to locate the macOS player executable");
        let metadata = read_macos_application_metadata(&executable_path)
            .expect("failed to load the macOS player application identity");
        context.config_mut().identifier = metadata.identifier;
        if let Some(title) = metadata.title {
            context.config_mut().product_name = Some(title.clone());
            context.package_info_mut().name = title;
        }
        if let Some(version) = metadata.version {
            context.config_mut().version = Some(version.clone());
            context.package_info_mut().version = version
                .parse()
                .expect("failed to load the macOS player application version");
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_embedded_package_info,
            read_embedded_package_range,
            windows_system_menu::show_windows_system_menu
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(context)
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::resolve_embedded_package_path_from_executable;

    #[cfg(target_os = "macos")]
    use super::{MacosApplicationMetadata, parse_macos_application_metadata};

    #[cfg(target_os = "macos")]
    #[test]
    fn resolves_macos_package_from_application_resources() {
        let executable = Path::new("/Applications/Game.app/Contents/MacOS/Game");
        assert_eq!(
            resolve_embedded_package_path_from_executable(executable).unwrap(),
            Path::new("/Applications/Game.app/Contents/Resources/routevn-package.bin")
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn reads_exported_name_version_and_identifier_for_tauri_runtime_metadata() {
        let mut dictionary = plist::Dictionary::new();
        dictionary.insert(
            "CFBundleIdentifier".to_string(),
            "com.example.project-one".into(),
        );
        dictionary.insert("CFBundleDisplayName".to_string(), "Project One".into());
        dictionary.insert("CFBundleName".to_string(), "Ignored Name".into());
        dictionary.insert("CFBundleShortVersionString".to_string(), "2.4.1".into());

        assert_eq!(
            parse_macos_application_metadata(&dictionary).unwrap(),
            MacosApplicationMetadata {
                identifier: "com.example.project-one".to_string(),
                title: Some("Project One".to_string()),
                version: Some("2.4.1".to_string()),
            }
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn resolves_windows_package_from_the_executable() {
        let executable = Path::new(r"C:\Games\Game.exe");
        assert_eq!(
            resolve_embedded_package_path_from_executable(executable).unwrap(),
            executable
        );
    }
}
