use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use routevn_android_export::signing::write_private_file;
use routevn_android_export::{
    AndroidExportRequest, AndroidExportResult, ErrorCode, ExportError, HostCapabilities,
    SigningKey, SigningKeyMaterial,
};
use tauri::ipc::Channel;
use zeroize::Zeroizing;

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

async fn run_blocking<T: Send + 'static>(
    task: impl FnOnce() -> Result<T, ExportError> + Send + 'static,
) -> Result<T, ExportError> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| {
            ExportError::new(
                ErrorCode::SigningFailed,
                format!("Failed to run the signing task: {error}"),
            )
        })?
}

// Keys belong to the project, which stores them as SigningKeyMaterial. These
// commands only make, read, and write keys; they keep nothing.

/// Create Key: a new key whose certificate names the game.
#[tauri::command]
pub async fn create_android_signing_key(
    application_name: String,
    application_id: String,
) -> Result<SigningKeyMaterial, ExportError> {
    run_blocking(move || SigningKey::generate(&application_name, &application_id)?.to_material())
        .await
}

/// Upload Key: the key in a PKCS #12 keystore file on this device.
#[tauri::command]
pub async fn read_android_keystore(
    path: String,
    password: String,
    alias: Option<String>,
) -> Result<SigningKeyMaterial, ExportError> {
    let password = Zeroizing::new(password);
    run_blocking(move || {
        SigningKey::read_pkcs12_file(Path::new(&path), &password, alias.as_deref())?.to_material()
    })
    .await
}

/// Save a Copy: a password-protected PKCS #12 keystore at a path the creator
/// chose, readable only by the user.
#[tauri::command]
pub async fn write_android_keystore(
    path: String,
    password: String,
    alias: String,
    key: SigningKeyMaterial,
) -> Result<(), ExportError> {
    let password = Zeroizing::new(password);
    run_blocking(move || {
        let key = SigningKey::from_material(&key)?;
        let keystore = Zeroizing::new(key.to_pkcs12(&password, &alias)?);
        write_private_file(Path::new(&path), &keystore)
    })
    .await
}

/// Exports an APK, signed with the project's `signing_key` when one is
/// given, or unsigned.
#[tauri::command]
pub async fn export_android_apk(
    request: AndroidExportRequest,
    signing_key: Option<SigningKeyMaterial>,
    on_progress: Channel<routevn_exporter::ZipExportProgress>,
) -> Result<AndroidExportResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let signing_key = signing_key
            .as_ref()
            .map(SigningKey::from_material)
            .transpose()
            .map_err(|error| error.to_string())?;
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
        routevn_android_export::export_android_apk_with_key(
            &request,
            signing_key.as_ref(),
            Some(&progress_callback),
        )
        .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Failed to run Android export task: {error}"))?
}
