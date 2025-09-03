use tauri::Manager;

mod project_db;
use project_db::ProjectDbManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Enable WebKit inspector for WSL
    #[cfg(debug_assertions)]
    {
        std::env::set_var("WEBKIT_INSPECTOR_SERVER", "127.0.0.1:9333");
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_devtools::init())
        .manage(ProjectDbManager::new())
        .invoke_handler(tauri::generate_handler![
            project_db::open_project_db,
            project_db::close_project_db,
            project_db::add_project_action,
            project_db::get_project_events
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
