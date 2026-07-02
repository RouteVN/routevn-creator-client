pub use routevn_exporter::{ZipAssetInput, ZipExportStats};

#[tauri::command]
pub async fn create_distribution_zip_streamed(
    output_path: String,
    assets: Vec<ZipAssetInput>,
    instructions_json: String,
    index_html: Option<String>,
    main_js: Option<String>,
    use_part_file: Option<bool>,
) -> Result<ZipExportStats, String> {
    let use_part_file = use_part_file.unwrap_or(true);

    tauri::async_runtime::spawn_blocking(move || {
        routevn_exporter::create_distribution_zip_streamed_sync(
            output_path,
            assets,
            instructions_json,
            index_html,
            main_js,
            use_part_file,
        )
    })
    .await
    .map_err(|e| format!("Failed to run zip export task: {e}"))?
}
