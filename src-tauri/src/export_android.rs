use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use routevn_android_export::{AndroidExportRequest, AndroidExportResult, HostCapabilities};
use tauri::ipc::Channel;

#[tauri::command]
pub fn get_android_export_host_capabilities(
    template_path: String,
    descriptor_path: String,
) -> HostCapabilities {
    routevn_android_export::host_capabilities(
        &PathBuf::from(template_path),
        &PathBuf::from(descriptor_path),
    )
}

#[tauri::command]
pub async fn export_android_apk(
    request: AndroidExportRequest,
    on_progress: Channel<routevn_exporter::ZipExportProgress>,
) -> Result<AndroidExportResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let export_started = Instant::now();
        let progress_state = Mutex::new((String::new(), Instant::now()));
        let progress_callback = |mut progress: routevn_exporter::ZipExportProgress| {
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
        routevn_android_export::export_android_apk(&request, Some(&progress_callback))
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Failed to run Android export task: {error}"))?
}
