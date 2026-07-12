use serde::Serialize;

mod windows_system_menu;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EmbeddedPackageInfo {
    byte_length: u64,
    chunk_size: u64,
    segment_count: u64,
}

#[tauri::command]
fn get_embedded_package_info() -> Result<EmbeddedPackageInfo, String> {
    let exe_path =
        std::env::current_exe().map_err(|error| format!("Failed to locate executable: {error}"))?;
    let metadata =
        routevn_packager::payload::read_self_contained_embedded_payload_metadata(&exe_path)
            .map_err(|error| error.to_string())?;

    Ok(EmbeddedPackageInfo {
        byte_length: metadata.plaintext_len,
        chunk_size: metadata.chunk_size,
        segment_count: metadata.segment_count,
    })
}

#[tauri::command]
fn read_embedded_package_range(offset: u64, length: u64) -> Result<Vec<u8>, String> {
    let exe_path =
        std::env::current_exe().map_err(|error| format!("Failed to locate executable: {error}"))?;
    routevn_packager::payload::read_self_contained_embedded_payload_range(&exe_path, offset, length)
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
