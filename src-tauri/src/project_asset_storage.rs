use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::Path;
use tauri::ipc::{InvokeBody, Request};
use tauri_plugin_fs::FsExt;

fn write_verified_asset(path: &Path, bytes: &[u8], expected_sha256: &str) -> Result<(), String> {
    write_verified_asset_with(path, bytes, expected_sha256, |file, data| {
        file.write_all(data)
    })
}

fn write_verified_asset_with(
    path: &Path,
    bytes: &[u8],
    expected_sha256: &str,
    write: impl FnOnce(&mut File, &[u8]) -> std::io::Result<()>,
) -> Result<(), String> {
    if expected_sha256.len() != 64 || !expected_sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("Invalid asset checksum.".into());
    }
    let parent = path.parent().ok_or("Missing asset directory.")?;
    // A sibling temporary file stays on the same filesystem as the target.
    // Drop removes it on any write, flush, verification, or publication error.
    let mut temporary = tempfile::Builder::new()
        .prefix("routevn-asset-")
        .suffix(".tmp")
        .tempfile_in(parent)
        .map_err(|error| format!("Could not create temporary asset: {error}"))?;
    write(temporary.as_file_mut(), bytes)
        .map_err(|error| format!("Could not write asset: {error}"))?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| format!("Could not flush asset: {error}"))?;
    let file = temporary.as_file_mut();
    if file.metadata().map_err(|error| error.to_string())?.len() != bytes.len() as u64 {
        return Err("The saved asset size did not match. Please try importing again.".into());
    }
    file.seek(SeekFrom::Start(0))
        .map_err(|error| error.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    if !format!("{:x}", hasher.finalize()).eq_ignore_ascii_case(expected_sha256) {
        return Err("The saved asset checksum did not match. Please try importing again.".into());
    }
    // Asset IDs are immutable. A collision must never truncate an existing
    // asset, including one still referenced by the project or its history.
    temporary.persist_noclobber(path).map_err(|error| {
        format!("Could not publish asset without overwriting an existing file: {error}")
    })?;
    Ok(())
}

#[tauri::command]
pub async fn write_project_asset(
    app: tauri::AppHandle,
    request: Request<'_>,
) -> Result<(), String> {
    let encoded_path = request
        .headers()
        .get("x-asset-path")
        .and_then(|value| value.to_str().ok())
        .ok_or("Missing asset path.")?;
    let path = std::path::PathBuf::from(
        urlencoding::decode(encoded_path)
            .map_err(|_| "Invalid asset path.")?
            .into_owned(),
    );
    let expected_sha256 = request
        .headers()
        .get("x-asset-sha256")
        .and_then(|value| value.to_str().ok())
        .ok_or("Missing asset checksum.")?
        .to_owned();
    let parent = path.parent().ok_or("Missing asset directory.")?;
    let file_id = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("Invalid asset ID.")?;
    if !path.is_absolute()
        || parent.file_name().and_then(|name| name.to_str()) != Some("files")
        || file_id.is_empty()
        || file_id.len() > 128
        || !file_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
    {
        return Err("Invalid project asset path.".into());
    }
    // Match the picker-granted filesystem scope. Resolve the existing parent
    // so symlinks cannot turn an allowed project path into an unrelated write.
    let canonical_parent = parent.canonicalize().map_err(|error| error.to_string())?;
    let canonical_path = canonical_parent.join(file_id);
    let scope = app.fs_scope();
    if !scope.is_allowed(&path) || !scope.is_allowed(&canonical_path) {
        return Err("The project asset is outside the allowed filesystem scope.".into());
    }
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) => bytes,
        _ => return Err("Expected binary asset data.".into()),
    };
    // Like plugin-fs, use an async command to run off the UI thread while
    // borrowing the raw IPC payload instead of cloning a potentially large video.
    write_verified_asset(&canonical_path, bytes, &expected_sha256)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn checksum(bytes: &[u8]) -> String {
        format!("{:x}", Sha256::digest(bytes))
    }

    #[test]
    fn publishes_verified_bytes_and_removes_temporary_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("asset-one");
        let bytes = b"font asset bytes";
        write_verified_asset(&path, bytes, &checksum(bytes)).unwrap();
        assert_eq!(std::fs::read(path).unwrap(), bytes);
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn partial_and_corrupted_writes_never_publish() {
        for corrupt in [false, true] {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("asset-one");
            let bytes = b"original";
            let result = write_verified_asset_with(&path, bytes, &checksum(bytes), |file, _| {
                file.write_all(if corrupt { b"modified" } else { b"part" })
            });
            assert!(result.is_err());
            assert!(!path.exists());
            assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
        }
    }

    #[test]
    fn write_failure_cleans_up_and_collision_preserves_existing_asset() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("asset-one");
        let bytes = b"new";
        let result = write_verified_asset_with(&path, bytes, &checksum(bytes), |file, data| {
            file.write_all(data)?;
            Err(std::io::Error::other("simulated full disk"))
        });
        assert!(result.is_err());
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
        std::fs::write(&path, b"existing").unwrap();
        assert!(write_verified_asset(&path, bytes, &checksum(bytes)).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"existing");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }
}
