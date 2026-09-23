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
mod export_macos;
mod export_windows;
mod export_zip;
mod linux_desktop_integration;
#[cfg(target_os = "macos")]
mod macos_fullscreen_escape;
mod project_acceptance_lock;
mod project_file_protocol;
mod project_media_server;
mod static_web_server;
mod windows_system_menu;

#[tauri::command]
fn canonical_project_path(project_path: String) -> Result<String, String> {
    project_acceptance_lock::ProjectAcceptanceLocks::canonical_path(std::path::Path::new(
        &project_path,
    ))
    .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
fn acquire_project_acceptance_lock(
    window: tauri::Window,
    project_path: String,
    owner_id: String,
    locks: tauri::State<'_, project_acceptance_lock::ProjectAcceptanceLocks>,
) -> Result<bool, String> {
    locks.acquire(
        std::path::Path::new(&project_path),
        &format!("{}:{owner_id}", window.label()),
    )
}

#[tauri::command]
fn release_project_acceptance_lock(
    window: tauri::Window,
    project_path: String,
    owner_id: String,
    locks: tauri::State<'_, project_acceptance_lock::ProjectAcceptanceLocks>,
) -> Result<(), String> {
    locks.release(
        std::path::Path::new(&project_path),
        &format!("{}:{owner_id}", window.label()),
    )
}

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

    let builder = tauri::Builder::default()
        .manage(project_acceptance_lock::ProjectAcceptanceLocks::default())
        .manage(project_media_server::ProjectMediaServerState::new())
        .manage(static_web_server::StaticWebServerState::new())
        .register_uri_scheme_protocol("project-file", project_file_protocol::handle);

    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    let builder = builder.manage(discord_presence::DiscordPresenceState::new());

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window
                    .state::<project_acceptance_lock::ProjectAcceptanceLocks>()
                    .release_window(window.label());
            }
        })
        .invoke_handler(tauri::generate_handler![
            canonical_project_path,
            acquire_project_acceptance_lock,
            release_project_acceptance_lock,
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
            project_media_server::get_project_media_server_origin,
            discord_presence::set_discord_presence_details,
            static_web_server::start_static_web_server,
            static_web_server::stop_static_web_server,
            static_web_server::list_static_web_servers,
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
