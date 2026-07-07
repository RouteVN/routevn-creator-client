use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinuxAppImageDesktopIntegrationStatus {
    available: bool,
    integrated: bool,
    appimage_path: Option<String>,
    installed_appimage_path: Option<String>,
    desktop_file_path: Option<String>,
}

#[tauri::command]
pub fn get_linux_appimage_desktop_integration_status(
) -> Result<LinuxAppImageDesktopIntegrationStatus, String> {
    Ok(get_status())
}

#[tauri::command]
pub fn install_linux_appimage_desktop_integration(
) -> Result<LinuxAppImageDesktopIntegrationStatus, String> {
    install_integration()?;
    Ok(get_status())
}

#[tauri::command]
pub fn restart_linux_appimage_from_desktop_integration(
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    restart_from_integration(&app_handle)
}

#[cfg(not(target_os = "linux"))]
fn get_status() -> LinuxAppImageDesktopIntegrationStatus {
    LinuxAppImageDesktopIntegrationStatus {
        available: false,
        integrated: false,
        appimage_path: None,
        installed_appimage_path: None,
        desktop_file_path: None,
    }
}

#[cfg(not(target_os = "linux"))]
fn install_integration() -> Result<(), String> {
    Err("Linux AppImage desktop integration is only available on Linux.".into())
}

#[cfg(not(target_os = "linux"))]
fn restart_from_integration(_app_handle: &tauri::AppHandle) -> Result<(), String> {
    Err("Linux AppImage desktop integration is only available on Linux.".into())
}

#[cfg(target_os = "linux")]
mod linux {
    use super::LinuxAppImageDesktopIntegrationStatus;
    use std::env;
    use std::fs;
    use std::io;
    use std::os::unix::fs::PermissionsExt;
    use std::path::{Path, PathBuf};
    use std::process::Command;

    const APPIMAGE_FILE_NAME: &str = "RouteVN-Creator.AppImage";
    const DESKTOP_FILE_NAME: &str = "routevn-creator.desktop";
    const ICON_FILE_NAME: &str = "routevn-creator.png";
    const ICON_NAME: &str = "routevn-creator";

    const ICONS: &[(&str, &[u8])] = &[
        ("32x32", include_bytes!("../icons/32x32.png")),
        ("128x128", include_bytes!("../icons/128x128.png")),
        ("256x256", include_bytes!("../icons/128x128@2x.png")),
        ("512x512", include_bytes!("../icons/icon.png")),
    ];

    pub fn get_status() -> LinuxAppImageDesktopIntegrationStatus {
        let appimage_path = current_appimage_path();
        let home_dir = home_dir();
        let data_home = home_dir.as_ref().map(|path| data_home_path(path));
        let installed_appimage_path = home_dir
            .as_ref()
            .map(|path| resolve_installed_appimage_path(path));
        let desktop_file_path = home_dir
            .as_ref()
            .map(|path| resolve_desktop_file_path(path));

        let existing_desktop_file_path = match (&data_home, &appimage_path) {
            (Some(data_home), Some(appimage_path)) => {
                find_existing_desktop_file(data_home, appimage_path)
            }
            _ => None,
        };
        let target_integrated = match (&installed_appimage_path, &desktop_file_path) {
            (Some(installed_appimage_path), Some(desktop_file_path)) => {
                installed_appimage_path.is_file()
                    && desktop_file_points_to(desktop_file_path, installed_appimage_path)
            }
            _ => false,
        };
        let integrated = existing_desktop_file_path.is_some() || target_integrated;
        let resolved_installed_appimage_path = if existing_desktop_file_path.is_some() {
            appimage_path.as_ref()
        } else {
            installed_appimage_path.as_ref()
        };
        let resolved_desktop_file_path = existing_desktop_file_path
            .as_ref()
            .or_else(|| desktop_file_path.as_ref());

        LinuxAppImageDesktopIntegrationStatus {
            available: appimage_path.is_some(),
            integrated,
            appimage_path: appimage_path.as_ref().map(|path| path_to_string(path)),
            installed_appimage_path: resolved_installed_appimage_path
                .map(|path| path_to_string(path)),
            desktop_file_path: resolved_desktop_file_path.map(|path| path_to_string(path)),
        }
    }

    pub fn install_integration() -> Result<(), String> {
        let appimage_path = current_appimage_path()
            .ok_or_else(|| "RouteVN Creator is not running from an AppImage.".to_string())?;
        let home_dir =
            home_dir().ok_or_else(|| "Could not find the home directory.".to_string())?;
        let target_appimage_path = resolve_installed_appimage_path(&home_dir);
        let data_home = data_home_path(&home_dir);
        let desktop_file_path = resolve_desktop_file_path(&home_dir);

        fs::create_dir_all(
            target_appimage_path
                .parent()
                .ok_or_else(|| "Invalid AppImage install path.".to_string())?,
        )
        .map_err(format_io_error)?;

        if !paths_refer_to_same_file(&appimage_path, &target_appimage_path) {
            copy_appimage(&appimage_path, &target_appimage_path).map_err(format_io_error)?;
        } else {
            ensure_user_executable(&target_appimage_path).map_err(format_io_error)?;
        }

        install_icons(&data_home).map_err(format_io_error)?;
        write_desktop_file(&desktop_file_path, &target_appimage_path).map_err(format_io_error)?;

        Ok(())
    }

    pub fn restart_from_integration(app_handle: &tauri::AppHandle) -> Result<(), String> {
        let home_dir =
            home_dir().ok_or_else(|| "Could not find the home directory.".to_string())?;
        let target_appimage_path = resolve_installed_appimage_path(&home_dir);

        if !target_appimage_path.is_file() {
            return Err("The installed RouteVN Creator AppImage was not found.".to_string());
        }

        ensure_user_executable(&target_appimage_path).map_err(format_io_error)?;
        launch_appimage(&target_appimage_path).map_err(format_io_error)?;
        app_handle.exit(0);

        Ok(())
    }

    fn current_appimage_path() -> Option<PathBuf> {
        env::var_os("APPIMAGE")
            .map(PathBuf::from)
            .filter(|path| path.is_file())
    }

    fn home_dir() -> Option<PathBuf> {
        env::var_os("HOME")
            .map(PathBuf::from)
            .filter(|path| !path.as_os_str().is_empty())
    }

    fn data_home_path(home_dir: &Path) -> PathBuf {
        env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
            .unwrap_or_else(|| home_dir.join(".local/share"))
    }

    fn resolve_installed_appimage_path(home_dir: &Path) -> PathBuf {
        home_dir.join("Applications").join(APPIMAGE_FILE_NAME)
    }

    fn resolve_desktop_file_path(home_dir: &Path) -> PathBuf {
        data_home_path(home_dir)
            .join("applications")
            .join(DESKTOP_FILE_NAME)
    }

    fn install_icons(data_home: &Path) -> io::Result<()> {
        for (size, data) in ICONS {
            let icon_path = data_home
                .join("icons/hicolor")
                .join(size)
                .join("apps")
                .join(ICON_FILE_NAME);

            if let Some(parent) = icon_path.parent() {
                fs::create_dir_all(parent)?;
            }

            fs::write(icon_path, data)?;
        }

        Ok(())
    }

    fn write_desktop_file(desktop_file_path: &Path, appimage_path: &Path) -> io::Result<()> {
        if let Some(parent) = desktop_file_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let contents = format!(
            "[Desktop Entry]\n\
             Type=Application\n\
             Name=RouteVN Creator\n\
             Comment=RouteVN Creator\n\
             Exec={}\n\
             Icon={ICON_NAME}\n\
             Terminal=false\n\
             Categories=Graphics;\n\
             StartupWMClass=routevn-creator\n",
            quote_desktop_exec_path(appimage_path)
        );

        fs::write(desktop_file_path, contents)
    }

    fn quote_desktop_exec_path(path: &Path) -> String {
        let raw = path.to_string_lossy();
        let escaped = raw
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('$', "\\$")
            .replace('`', "\\`");
        format!("\"{escaped}\"")
    }

    fn desktop_file_points_to(desktop_file_path: &Path, appimage_path: &Path) -> bool {
        let Ok(contents) = fs::read_to_string(desktop_file_path) else {
            return false;
        };

        contents.contains("Name=RouteVN Creator")
            && contents.contains("Icon=routevn-creator")
            && contents.contains(&path_to_string(appimage_path))
    }

    fn find_existing_desktop_file(data_home: &Path, appimage_path: &Path) -> Option<PathBuf> {
        let applications_dir = data_home.join("applications");
        let entries = fs::read_dir(applications_dir).ok()?;
        let appimage_path = path_to_string(appimage_path);

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("desktop") {
                continue;
            }

            let Ok(contents) = fs::read_to_string(&path) else {
                continue;
            };

            if contents.contains(&appimage_path) && contents.contains("routevn-creator") {
                return Some(path);
            }
        }

        None
    }

    fn copy_appimage(source: &Path, target: &Path) -> io::Result<()> {
        let temp_target = target.with_extension("AppImage.tmp");
        if temp_target.exists() {
            fs::remove_file(&temp_target)?;
        }

        fs::copy(source, &temp_target)?;
        ensure_user_executable(&temp_target)?;
        fs::rename(temp_target, target)?;
        Ok(())
    }

    fn ensure_user_executable(path: &Path) -> io::Result<()> {
        let mut permissions = fs::metadata(path)?.permissions();
        permissions.set_mode(permissions.mode() | 0o700);
        fs::set_permissions(path, permissions)
    }

    fn launch_appimage(path: &Path) -> io::Result<()> {
        let mut command = Command::new(path);

        if let Some(parent) = path.parent() {
            command.current_dir(parent);
        }

        clear_appimage_environment(&mut command);
        command.spawn()?;
        Ok(())
    }

    fn clear_appimage_environment(command: &mut Command) {
        for (key, _) in env::vars_os() {
            let key_string = key.to_string_lossy();
            if key_string.starts_with("APPIMAGE_") {
                command.env_remove(key);
            }
        }

        for key in [
            "APPDIR",
            "APPIMAGE",
            "ARGV0",
            "GI_TYPELIB_PATH",
            "GST_PLUGIN_PATH_1_0",
            "GST_PLUGIN_SCANNER_1_0",
            "GST_PLUGIN_SYSTEM_PATH_1_0",
            "GST_PTP_HELPER_1_0",
            "LD_LIBRARY_PATH",
            "OWD",
        ] {
            command.env_remove(key);
        }
    }

    fn paths_refer_to_same_file(left: &Path, right: &Path) -> bool {
        match (left.canonicalize(), right.canonicalize()) {
            (Ok(left), Ok(right)) => left == right,
            _ => left == right,
        }
    }

    fn path_to_string(path: &Path) -> String {
        path.to_string_lossy().into_owned()
    }

    fn format_io_error(error: io::Error) -> String {
        error.to_string()
    }
}

#[cfg(target_os = "linux")]
fn get_status() -> LinuxAppImageDesktopIntegrationStatus {
    linux::get_status()
}

#[cfg(target_os = "linux")]
fn install_integration() -> Result<(), String> {
    linux::install_integration()
}

#[cfg(target_os = "linux")]
fn restart_from_integration(app_handle: &tauri::AppHandle) -> Result<(), String> {
    linux::restart_from_integration(app_handle)
}
