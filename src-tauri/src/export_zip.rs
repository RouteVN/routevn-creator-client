use serde::Deserialize;
use serde_json::{Map, Value};
use std::ffi::OsString;
use std::fs::{self, File};
use std::io::{BufReader, BufWriter, Read, Seek, Write};
use std::path::{Path, PathBuf};
use zip::write::FileOptions;
use zip::{CompressionMethod, ZipWriter};

const BUNDLE_VERSION: u8 = 1;
const BUNDLE_HEADER_SIZE: usize = 16;
const COPY_BUFFER_SIZE: usize = 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZipAssetInput {
    pub id: String,
    pub path: String,
    pub mime: Option<String>,
}

fn make_part_path(path: &Path) -> PathBuf {
    let mut part_path: OsString = path.as_os_str().to_os_string();
    part_path.push(".part");
    PathBuf::from(part_path)
}

fn copy_file_to_writer<W: Write>(source_path: &Path, writer: &mut W) -> Result<(), String> {
    let source_file = File::open(source_path)
        .map_err(|e| format!("Failed to open source file {}: {e}", source_path.display()))?;
    let mut reader = BufReader::new(source_file);
    let mut buffer = vec![0u8; COPY_BUFFER_SIZE];

    loop {
        let bytes_read = reader
            .read(&mut buffer)
            .map_err(|e| format!("Failed to read source file {}: {e}", source_path.display()))?;
        if bytes_read == 0 {
            break;
        }
        writer
            .write_all(&buffer[..bytes_read])
            .map_err(|e| format!("Failed to write chunk: {e}"))?;
    }

    Ok(())
}

fn build_bundle_index(
    assets: &[ZipAssetInput],
    instructions_len: u64,
) -> Result<(Vec<u8>, Vec<(String, PathBuf)>), String> {
    let mut current_offset = 0u64;
    let mut index_map = Map::new();
    let mut ordered_asset_paths = Vec::with_capacity(assets.len());

    for asset in assets {
        let asset_path = PathBuf::from(&asset.path);
        let metadata = fs::metadata(&asset_path).map_err(|e| {
            format!(
                "Failed to read metadata for asset {} at {}: {e}",
                asset.id,
                asset_path.display()
            )
        })?;
        let file_size = metadata.len();
        let end = if file_size == 0 {
            current_offset
        } else {
            current_offset + file_size - 1
        };

        let mime = asset
            .mime
            .clone()
            .unwrap_or_else(|| "application/octet-stream".to_string());

        let mut entry = Map::new();
        entry.insert("start".to_string(), Value::from(current_offset));
        entry.insert("end".to_string(), Value::from(end));
        entry.insert("mime".to_string(), Value::from(mime));
        index_map.insert(asset.id.clone(), Value::Object(entry));
        ordered_asset_paths.push((asset.id.clone(), asset_path));

        current_offset += file_size;
    }

    let instructions_end = if instructions_len == 0 {
        current_offset
    } else {
        current_offset + instructions_len - 1
    };
    let mut instructions_entry = Map::new();
    instructions_entry.insert("start".to_string(), Value::from(current_offset));
    instructions_entry.insert("end".to_string(), Value::from(instructions_end));
    instructions_entry.insert("mime".to_string(), Value::from("application/json"));
    index_map.insert(
        "instructions".to_string(),
        Value::Object(instructions_entry),
    );

    let index_bytes = serde_json::to_vec(&Value::Object(index_map))
        .map_err(|e| format!("Failed to serialize bundle index: {e}"))?;

    Ok((index_bytes, ordered_asset_paths))
}

fn write_package_bin_entry<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    assets: &[ZipAssetInput],
    instructions_json: &str,
) -> Result<(), String> {
    let instructions_bytes = instructions_json.as_bytes();
    let (index_bytes, ordered_asset_paths) =
        build_bundle_index(assets, instructions_bytes.len() as u64)?;

    if index_bytes.len() > u32::MAX as usize {
        return Err("Bundle index is too large (> 4GB)".to_string());
    }

    let mut header = [0u8; BUNDLE_HEADER_SIZE];
    header[0] = BUNDLE_VERSION;
    let index_len = index_bytes.len() as u32;
    header[1..5].copy_from_slice(&index_len.to_be_bytes());

    zip.write_all(&header)
        .map_err(|e| format!("Failed to write bundle header: {e}"))?;
    zip.write_all(&index_bytes)
        .map_err(|e| format!("Failed to write bundle index: {e}"))?;

    for (_, asset_path) in ordered_asset_paths {
        copy_file_to_writer(&asset_path, zip)?;
    }

    zip.write_all(instructions_bytes)
        .map_err(|e| format!("Failed to write bundle instructions: {e}"))?;

    Ok(())
}

fn write_distribution_zip(
    work_path: &Path,
    assets: &[ZipAssetInput],
    instructions_json: &str,
    index_html: Option<&str>,
    main_js: Option<&str>,
) -> Result<(), String> {
    let file = File::create(work_path)
        .map_err(|e| format!("Failed to create zip file {}: {e}", work_path.display()))?;
    let writer = BufWriter::new(file);
    let mut zip = ZipWriter::new(writer);
    let options = FileOptions::default()
        .compression_method(CompressionMethod::Stored)
        .large_file(true);

    zip.start_file("package.bin", options)
        .map_err(|e| format!("Failed to create package.bin zip entry: {e}"))?;
    write_package_bin_entry(&mut zip, assets, instructions_json)?;

    if let Some(index_html) = index_html {
        zip.start_file("index.html", options)
            .map_err(|e| format!("Failed to create index.html zip entry: {e}"))?;
        zip.write_all(index_html.as_bytes())
            .map_err(|e| format!("Failed to write index.html content: {e}"))?;
    }

    if let Some(main_js) = main_js {
        zip.start_file("main.js", options)
            .map_err(|e| format!("Failed to create main.js zip entry: {e}"))?;
        zip.write_all(main_js.as_bytes())
            .map_err(|e| format!("Failed to write main.js content: {e}"))?;
    }

    zip.finish()
        .map_err(|e| format!("Failed to finalize zip: {e}"))?;
    Ok(())
}

fn create_distribution_zip_streamed_sync(
    output_path: String,
    assets: Vec<ZipAssetInput>,
    instructions_json: String,
    index_html: Option<String>,
    main_js: Option<String>,
    use_part_file: bool,
) -> Result<(), String> {
    let final_path = PathBuf::from(output_path);
    let work_path = if use_part_file {
        make_part_path(&final_path)
    } else {
        final_path.clone()
    };

    if let Some(parent) = final_path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            format!(
                "Failed to ensure output directory {} exists: {e}",
                parent.display()
            )
        })?;
    }

    let write_result = write_distribution_zip(
        &work_path,
        &assets,
        &instructions_json,
        index_html.as_deref(),
        main_js.as_deref(),
    );

    if let Err(error) = write_result {
        if use_part_file {
            let _ = fs::remove_file(&work_path);
        }
        return Err(error);
    }

    if use_part_file {
        if final_path.exists() {
            fs::remove_file(&final_path).map_err(|e| {
                format!(
                    "Failed to remove existing output file {}: {e}",
                    final_path.display()
                )
            })?;
        }

        fs::rename(&work_path, &final_path).map_err(|e| {
            format!(
                "Failed to move temporary zip {} to final destination {}: {e}",
                work_path.display(),
                final_path.display()
            )
        })?;
    }

    Ok(())
}

#[tauri::command]
pub async fn create_distribution_zip_streamed(
    output_path: String,
    assets: Vec<ZipAssetInput>,
    instructions_json: String,
    index_html: Option<String>,
    main_js: Option<String>,
    use_part_file: Option<bool>,
) -> Result<(), String> {
    let use_part_file = use_part_file.unwrap_or(true);

    tauri::async_runtime::spawn_blocking(move || {
        create_distribution_zip_streamed_sync(
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
