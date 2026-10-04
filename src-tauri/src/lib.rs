#[cfg(any(debug_assertions, target_os = "macos"))]
use tauri::Manager;

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
mod discord_presence;
#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
mod discord_presence {
    #[tauri::command]
    pub fn set_discord_presence_details(_details: String) -> Result<(), String> {
        Err("Discord presence is unavailable on this platform.".to_string())
    }
}
mod client_update;
#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
mod download;
#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
mod error_reporting;
mod export_macos;
mod export_windows;
mod export_zip;
mod linux_desktop_integration;
#[cfg(target_os = "macos")]
mod macos_fullscreen_escape;
#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
mod project_import;
#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
mod download {
    use serde_json::Value;

    #[tauri::command]
    pub async fn download_file(
        _url: String,
        _destination: String,
        _max_bytes: u64,
        _on_progress: tauri::ipc::Channel<Value>,
    ) -> Result<Value, String> {
        Err("downloadFailed: downloads are unavailable on this platform".to_string())
    }
}
#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
mod project_import {
    use serde_json::Value;

    const UNAVAILABLE: &str =
        "importFailed: project import commands are unavailable on this platform";

    #[tauri::command]
    pub async fn list_archive(_archive: String, _max_entries: u64) -> Result<Value, String> {
        Err(UNAVAILABLE.to_string())
    }

    #[tauri::command]
    pub async fn extract_archive(
        _archive: String,
        _destination: String,
        _files: Vec<Value>,
        _max_bytes: u64,
        _on_progress: tauri::ipc::Channel<Value>,
    ) -> Result<Value, String> {
        Err(UNAVAILABLE.to_string())
    }
}
mod project_file_protocol;
mod project_media_server;
mod static_web_server;
mod test_crash;
mod update_device_info;
mod windows_system_menu;

#[cfg(target_os = "linux")]
fn configure_linux_graphics_workarounds() {
    // WebKitGTK's DMABUF renderer can corrupt WebGL/Pixi output on some Mesa and VM drivers.
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        // SAFETY: this runs at process startup before the Tauri runtime starts
        // worker threads or plugins that could concurrently read environment.
        unsafe {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }
}

#[cfg(not(target_os = "linux"))]
fn configure_linux_graphics_workarounds() {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    configure_linux_graphics_workarounds();

    // Enable WebKit inspector for WSL
    #[cfg(debug_assertions)]
    {
        // SAFETY: debug environment is configured before the Tauri runtime is
        // started, so there are no concurrent environment readers here.
        unsafe {
            std::env::set_var("WEBKIT_INSPECTOR_SERVER", "127.0.0.1:9333");
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }
    }

    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    let _error_reporting = error_reporting::init();

    let builder = tauri::Builder::default()
        .manage(project_media_server::ProjectMediaServerState::new())
        .manage(static_web_server::StaticWebServerState::new())
        .register_uri_scheme_protocol("project-file", project_file_protocol::handle);

    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    let builder = builder
        .manage(discord_presence::DiscordPresenceState::new())
        .append_invoke_initialization_script(error_reporting::webview_init_script());

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .invoke_handler(tauri::generate_handler![
            export_macos::export_macos_application,
            export_macos::get_macos_export_host_capabilities,
            export_zip::create_distribution_zip_streamed,
            export_windows::export_windows_installer,
            export_windows::export_windows_installer_from_project,
            export_windows::export_windows_portable_executable,
            export_windows::get_windows_export_host_capabilities,
            export_windows::stamp_windows_executable,
            linux_desktop_integration::get_linux_appimage_desktop_integration_status,
            linux_desktop_integration::install_linux_appimage_desktop_integration,
            linux_desktop_integration::restart_linux_appimage_from_desktop_integration,
            download::download_file,
            project_import::list_archive,
            project_import::extract_archive,
            project_media_server::get_project_media_server_origin,
            discord_presence::set_discord_presence_details,
            static_web_server::start_static_web_server,
            static_web_server::stop_static_web_server,
            static_web_server::list_static_web_servers,
            test_crash::trigger_test_crash,
            update_device_info::get_update_device_info,
            client_update::check_client_update,
            windows_system_menu::show_windows_system_menu
        ])
        .setup(|_app| {
            #[cfg(target_os = "macos")]
            if let Some(window) = _app.get_webview_window("main") {
                macos_fullscreen_escape::install(&window)?;
            }

            #[cfg(debug_assertions)]
            if let Some(window) = _app.get_webview_window("main") {
                window.open_devtools();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
