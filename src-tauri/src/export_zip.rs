use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{State, ipc::Channel};

pub use routevn_exporter::{ZipAssetInput, ZipExportProgress, ZipExportStats};

#[derive(Default)]
pub struct ZipExportState {
    active_exports: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[tauri::command]
pub async fn create_distribution_zip_streamed(
    export_id: String,
    output_path: String,
    assets: Vec<ZipAssetInput>,
    instructions_json: String,
    index_html: Option<String>,
    main_js: Option<String>,
    manifest_json: Option<String>,
    web_icon_file_id: Option<String>,
    use_part_file: Option<bool>,
    on_progress: Channel<ZipExportProgress>,
    state: State<'_, ZipExportState>,
) -> Result<ZipExportStats, String> {
    let use_part_file = use_part_file.unwrap_or(true);
    let cancellation = Arc::new(AtomicBool::new(false));
    state
        .active_exports
        .lock()
        .map_err(|_| "Failed to initialize ZIP export cancellation.".to_string())?
        .insert(export_id.clone(), Arc::clone(&cancellation));

    let task_result = tauri::async_runtime::spawn_blocking(move || {
        let export_started = Instant::now();
        let progress_state = Mutex::new((String::new(), Instant::now()));
        let progress_callback = |mut progress: ZipExportProgress| {
            let now = Instant::now();
            progress.elapsed_ms =
                u64::try_from(export_started.elapsed().as_millis()).unwrap_or(u64::MAX);
            let Ok(mut state) = progress_state.lock() else {
                return;
            };
            let phase_changed = state.0 != progress.phase;
            let phase_complete = progress.total > 0 && progress.current == progress.total;
            let interval_elapsed = now.duration_since(state.1) >= Duration::from_millis(150);
            if !phase_changed && !phase_complete && !interval_elapsed {
                return;
            }

            state.0.clone_from(&progress.phase);
            state.1 = now;
            drop(state);
            let _ = on_progress.send(progress);
        };
        let is_cancelled = || cancellation.load(Ordering::Relaxed);

        routevn_exporter::create_distribution_zip_streamed_sync_with_control(
            output_path,
            assets,
            instructions_json,
            index_html,
            main_js,
            manifest_json,
            web_icon_file_id,
            use_part_file,
            Some(&progress_callback),
            Some(&is_cancelled),
        )
    })
    .await;

    if let Ok(mut active_exports) = state.active_exports.lock() {
        active_exports.remove(&export_id);
    }

    task_result.map_err(|e| format!("Failed to run zip export task: {e}"))?
}

#[tauri::command]
pub fn cancel_distribution_zip_export(export_id: String, state: State<'_, ZipExportState>) -> bool {
    let Ok(active_exports) = state.active_exports.lock() else {
        return false;
    };
    let Some(cancellation) = active_exports.get(&export_id) else {
        return false;
    };
    cancellation.store(true, Ordering::Relaxed);
    true
}
