#[cfg(target_os = "windows")]
#[path = "windows_system_menu_windows.rs"]
mod windows_impl;

#[tauri::command]
pub fn show_windows_system_menu(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let hwnd = window
            .hwnd()
            .map_err(|error| format!("failed to access the native window: {error}"))?;
        return windows_impl::show(hwnd);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = window;
        Ok(())
    }
}
