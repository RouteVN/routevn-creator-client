mod player_persistence;

use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;
use tauri::Manager;

use player_persistence::{PlayerPersistenceLoadResult, PlayerPersistenceState, ScopedDataUpdate};

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

fn runtime_database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|directory| directory.join("runtime.db"))
        .map_err(|error| format!("Failed to resolve the player data directory: {error}"))
}

async fn run_persistence_task<T, F>(
    app: tauri::AppHandle,
    operation_name: &'static str,
    operation: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(PathBuf) -> Result<T, String> + Send + 'static,
{
    let database_path = runtime_database_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || operation(database_path))
        .await
        .map_err(|error| format!("Failed to run {operation_name}: {error}"))?
}

#[tauri::command]
async fn load_player_persistence(
    app: tauri::AppHandle,
) -> Result<PlayerPersistenceLoadResult, String> {
    run_persistence_task(app, "player persistence load", |path| {
        player_persistence::load(&path)
    })
    .await
}

#[tauri::command]
async fn clear_player_persistence(app: tauri::AppHandle) -> Result<(), String> {
    run_persistence_task(app, "player persistence clear", |path| {
        player_persistence::clear(&path)
    })
    .await
}

#[tauri::command]
async fn save_player_save_slots(app: tauri::AppHandle, save_slots: Value) -> Result<(), String> {
    run_persistence_task(app, "player save-slot sync", move |path| {
        player_persistence::save_slots(&path, save_slots)
    })
    .await
}

#[tauri::command]
async fn save_player_persistence_value(
    app: tauri::AppHandle,
    key: String,
    value: Value,
) -> Result<(), String> {
    run_persistence_task(app, "player persistence save", move |path| {
        player_persistence::save_value(&path, &key, value)
    })
    .await
}

#[tauri::command]
async fn apply_player_scoped_data_updates(
    app: tauri::AppHandle,
    updates: Vec<ScopedDataUpdate>,
) -> Result<(), String> {
    run_persistence_task(app, "player scoped persistence update", move |path| {
        player_persistence::apply_scoped_data_updates(&path, updates)
    })
    .await
}

#[tauri::command]
async fn complete_legacy_player_persistence_migration(
    app: tauri::AppHandle,
    legacy_state: PlayerPersistenceState,
) -> Result<PlayerPersistenceLoadResult, String> {
    run_persistence_task(app, "legacy player persistence migration", move |path| {
        player_persistence::complete_legacy_migration(&path, legacy_state)
    })
    .await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_embedded_package_info,
            read_embedded_package_range,
            load_player_persistence,
            clear_player_persistence,
            save_player_save_slots,
            save_player_persistence_value,
            apply_player_scoped_data_updates,
            complete_legacy_player_persistence_migration
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
