use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Enable WebKit inspector for WSL
  #[cfg(debug_assertions)]
  {
    std::env::set_var("WEBKIT_INSPECTOR_SERVER", "127.0.0.1:9333");
    std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
  }
  
  tauri::Builder::default()
    .plugin(tauri_plugin_devtools::init())
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
