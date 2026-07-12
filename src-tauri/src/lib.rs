#[cfg(debug_assertions)]
use tauri::Manager;

mod export_windows;
mod export_zip;
mod linux_desktop_integration;
mod project_file_protocol;
mod project_media_server;
mod static_web_server;
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

    tauri::Builder::default()
        .manage(project_media_server::ProjectMediaServerState::new())
        .manage(static_web_server::StaticWebServerState::new())
        .register_uri_scheme_protocol("project-file", project_file_protocol::handle)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .invoke_handler(tauri::generate_handler![
            export_zip::create_distribution_zip_streamed,
            export_windows::export_windows_installer,
            export_windows::export_windows_installer_from_project,
            export_windows::export_windows_portable_executable,
            export_windows::get_windows_export_host_capabilities,
            export_windows::stamp_windows_executable,
            linux_desktop_integration::get_linux_appimage_desktop_integration_status,
            linux_desktop_integration::install_linux_appimage_desktop_integration,
            linux_desktop_integration::restart_linux_appimage_from_desktop_integration,
            project_media_server::get_project_media_server_origin,
            static_web_server::start_static_web_server,
            static_web_server::stop_static_web_server,
            static_web_server::list_static_web_servers,
            windows_system_menu::show_windows_system_menu
        ])
        .setup(|_app| {
            #[cfg(debug_assertions)]
            if let Some(window) = _app.get_webview_window("main") {
                window.open_devtools();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
