//! Sending a project to support. A project folder is packed into one zip that
//! Creator's zip import opens: a consistent copy of `project.db`, and the
//! files directly inside `files/` and `file-metadata/`, under one top-level
//! `project/` folder. The zip is written to a temporary folder, kept under an
//! ID the app chooses until the app discards it, and uploaded with one PUT to
//! a signed link. See `docs/support-uploads.md`.

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{
    Connection,
    sqlite::{SqliteConnectOptions, SqliteConnection},
};
use tauri::ipc::Channel;
use tokio::io::AsyncReadExt;
use url::Url;

use crate::download::{ProgressEvent, ProgressSink, channel_sink, err};

pub const INVALID_REQUEST: &str = "invalidRequest";
pub const PACK_FAILED: &str = "packFailed";
pub const UPLOAD_FAILED: &str = "uploadFailed";
pub const CANCELLED: &str = "cancelled";

const ARCHIVE_ROOT: &str = "project";
const PROJECT_DATABASE: &str = "project.db";
const ZIP_NAME: &str = "project.zip";
const CHUNK_BYTES: usize = 256 * 1024;
const TICK: Duration = Duration::from_millis(100);
// An upload fails when no bytes go out for this long, or when the server
// has not answered this long after the last byte.
const STALL_LIMIT: Duration = Duration::from_secs(60);
const RESPONSE_LIMIT: Duration = Duration::from_secs(120);
const MAX_HEADERS: usize = 16;
const MAX_ERROR_BODY: usize = 512;

// ---------- State ----------

struct Packed {
    // Deleted with the folder when the entry is dropped.
    _folder: tempfile::TempDir,
    zip: PathBuf,
    size_bytes: u64,
}

struct Entry {
    cancel: Arc<AtomicBool>,
    packed: Option<Packed>,
}

/// Packed projects by archive ID. An entry is added when packing starts, so
/// the app can cancel it, and holds the zip once packing succeeds.
#[derive(Default)]
pub struct SupportArchives {
    entries: Mutex<HashMap<String, Entry>>,
}

impl SupportArchives {
    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, Entry>> {
        self.entries
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    fn begin(&self, archive_id: &str) -> Result<Arc<AtomicBool>, String> {
        let mut entries = self.lock();
        if entries.contains_key(archive_id) {
            return Err(err(INVALID_REQUEST, "the archive ID is in use"));
        }
        let cancel = Arc::new(AtomicBool::new(false));
        entries.insert(
            archive_id.to_string(),
            Entry {
                cancel: Arc::clone(&cancel),
                packed: None,
            },
        );
        Ok(cancel)
    }

    /// Keeps the zip, unless the archive was discarded while it was packed.
    fn finish(&self, archive_id: &str, packed: Packed) -> bool {
        match self.lock().get_mut(archive_id) {
            Some(entry) => {
                entry.packed = Some(packed);
                true
            }
            None => false,
        }
    }

    fn packed(&self, archive_id: &str) -> Result<(PathBuf, u64, Arc<AtomicBool>), String> {
        let entries = self.lock();
        let entry = entries
            .get(archive_id)
            .ok_or_else(|| err(INVALID_REQUEST, "no such archive"))?;
        let packed = entry
            .packed
            .as_ref()
            .ok_or_else(|| err(INVALID_REQUEST, "the archive is not packed yet"))?;
        Ok((
            packed.zip.clone(),
            packed.size_bytes,
            Arc::clone(&entry.cancel),
        ))
    }

    fn cancel(&self, archive_id: &str) {
        if let Some(entry) = self.lock().get(archive_id) {
            entry.cancel.store(true, Ordering::SeqCst);
        }
    }

    /// Removes the entry, deleting its zip; a packing still running is
    /// cancelled and deletes its own folder.
    fn discard(&self, archive_id: &str) {
        if let Some(entry) = self.lock().remove(archive_id) {
            entry.cancel.store(true, Ordering::SeqCst);
        }
    }
}

fn check_archive_id(archive_id: &str) -> Result<(), String> {
    if (1..=64).contains(&archive_id.len()) && archive_id.bytes().all(|b| b.is_ascii_alphanumeric())
    {
        Ok(())
    } else {
        Err(err(INVALID_REQUEST, "invalid archive ID"))
    }
}

fn check_cancelled(cancel: &AtomicBool) -> Result<(), String> {
    if cancel.load(Ordering::SeqCst) {
        Err(err(CANCELLED, "sending the project was cancelled"))
    } else {
        Ok(())
    }
}

// ---------- Packing ----------

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveProgress {
    pub phase: &'static str,
    pub current: u64,
    pub total: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveSummary {
    pub size_bytes: u64,
    pub sha256: String,
}

/// A consistent copy of the project database, even while the app writes to
/// it: `VACUUM INTO` reads one snapshot, including what is still only in the
/// write-ahead log, and leaves the database unchanged.
async fn snapshot_database(database: &Path, snapshot: &Path) -> Result<(), String> {
    let options = SqliteConnectOptions::new()
        .filename(database)
        .create_if_missing(false)
        .busy_timeout(Duration::from_secs(10));
    let mut connection = SqliteConnection::connect_with(&options)
        .await
        .map_err(|error| err(PACK_FAILED, format!("cannot open the project: {error}")))?;
    let result = sqlx::query("VACUUM INTO ?")
        .bind(snapshot.to_string_lossy().into_owned())
        .execute(&mut connection)
        .await
        .map_err(|error| err(PACK_FAILED, format!("cannot copy the project: {error}")));
    let _ = connection.close().await;
    result.map(|_| ())
}

/// The regular files directly inside `folder`, by name, without dot-files,
/// links, subfolders or names that are not UTF-8. A missing folder has none.
fn folder_files(folder: &Path) -> Result<Vec<(String, PathBuf, u64)>, String> {
    let entries = match fs::read_dir(folder) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(err(PACK_FAILED, error)),
    };
    let mut files = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| err(PACK_FAILED, error))?;
        let file_type = entry.file_type().map_err(|error| err(PACK_FAILED, error))?;
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        if !file_type.is_file() || name.starts_with('.') {
            continue;
        }
        let size = entry
            .metadata()
            .map_err(|error| err(PACK_FAILED, error))?
            .len();
        files.push((name, entry.path(), size));
    }
    files.sort_by(|left, right| left.0.cmp(&right.0));
    Ok(files)
}

fn copy_into(
    source: &Path,
    writer: &mut impl Write,
    done: &mut u64,
    total: u64,
    cancel: &AtomicBool,
    progress: &mut ProgressSink,
) -> Result<(), String> {
    let mut reader = File::open(source)
        .map_err(|error| err(PACK_FAILED, format!("{}: {error}", source.display())))?;
    let mut buffer = vec![0u8; CHUNK_BYTES];
    loop {
        check_cancelled(cancel)?;
        let read = reader
            .read(&mut buffer)
            .map_err(|error| err(PACK_FAILED, format!("{}: {error}", source.display())))?;
        if read == 0 {
            return Ok(());
        }
        writer
            .write_all(&buffer[..read])
            .map_err(|error| err(PACK_FAILED, error))?;
        *done += read as u64;
        progress.report((*done).min(total), total);
    }
}

/// Writes the zip. Entries have fixed times and are in name order, so the
/// same project gives the same bytes and a retry the same SHA-256. Media in
/// `files/` is stored as it is; the database and metadata are compressed.
fn write_zip(
    project: &Path,
    snapshot: &Path,
    zip_path: &Path,
    cancel: &AtomicBool,
    progress: &mut ProgressSink,
) -> Result<(), String> {
    use zip::CompressionMethod::{Deflated, Stored};

    let snapshot_size = fs::metadata(snapshot)
        .map_err(|error| err(PACK_FAILED, error))?
        .len();
    let mut entries = vec![(
        format!("{ARCHIVE_ROOT}/{PROJECT_DATABASE}"),
        snapshot.to_path_buf(),
        snapshot_size,
        Deflated,
    )];
    for (folder, method) in [("files", Stored), ("file-metadata", Deflated)] {
        for (name, path, size) in folder_files(&project.join(folder))? {
            entries.push((
                format!("{ARCHIVE_ROOT}/{folder}/{name}"),
                path,
                size,
                method,
            ));
        }
    }
    let total = entries.iter().map(|entry| entry.2).sum::<u64>();

    let file = File::create_new(zip_path).map_err(|error| err(PACK_FAILED, error))?;
    let mut writer = zip::ZipWriter::new(BufWriter::new(file));
    let mut done = 0u64;
    progress.emit(0, total);
    for (name, path, size, method) in entries {
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(method)
            .last_modified_time(zip::DateTime::default())
            .large_file(size >= u64::from(u32::MAX));
        writer
            .start_file(name, options)
            .map_err(|error| err(PACK_FAILED, error))?;
        copy_into(&path, &mut writer, &mut done, total, cancel, progress)?;
    }
    let mut buffered = writer.finish().map_err(|error| err(PACK_FAILED, error))?;
    buffered.flush().map_err(|error| err(PACK_FAILED, error))?;
    progress.emit(total, total);
    Ok(())
}

/// The file's length and SHA-256 as lowercase hex, read in chunks.
fn hash_file(
    path: &Path,
    cancel: &AtomicBool,
    progress: &mut ProgressSink,
) -> Result<(u64, String), String> {
    let file = File::open(path).map_err(|error| err(PACK_FAILED, error))?;
    let total = file
        .metadata()
        .map_err(|error| err(PACK_FAILED, error))?
        .len();
    let mut reader = BufReader::with_capacity(CHUNK_BYTES, file);
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; CHUNK_BYTES];
    let mut done = 0u64;
    progress.emit(0, total);
    loop {
        check_cancelled(cancel)?;
        let read = reader
            .read(&mut buffer)
            .map_err(|error| err(PACK_FAILED, error))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        done += read as u64;
        progress.report(done, total);
    }
    progress.emit(done, total);
    let digest = hasher.finalize();
    let hex = digest.iter().map(|byte| format!("{byte:02x}")).collect();
    Ok((done, hex))
}

async fn pack(
    project: &Path,
    cancel: Arc<AtomicBool>,
    mut packing: ProgressSink,
    mut checking: ProgressSink,
) -> Result<(Packed, ArchiveSummary), String> {
    let database = project.join(PROJECT_DATABASE);
    if !database.is_file() {
        return Err(err(PACK_FAILED, "the folder has no project.db"));
    }
    let folder = tempfile::Builder::new()
        .prefix("routevn-support-")
        .tempdir()
        .map_err(|error| err(PACK_FAILED, error))?;
    let snapshot = folder.path().join(PROJECT_DATABASE);
    let zip = folder.path().join(ZIP_NAME);
    snapshot_database(&database, &snapshot).await?;
    check_cancelled(&cancel)?;

    let project = project.to_path_buf();
    let zip_path = zip.clone();
    let (size_bytes, sha256) = tauri::async_runtime::spawn_blocking(move || {
        write_zip(&project, &snapshot, &zip_path, &cancel, &mut packing)?;
        let _ = fs::remove_file(&snapshot);
        hash_file(&zip_path, &cancel, &mut checking)
    })
    .await
    .map_err(|error| err(PACK_FAILED, error))??;
    Ok((
        Packed {
            _folder: folder,
            zip,
            size_bytes,
        },
        ArchiveSummary { size_bytes, sha256 },
    ))
}

fn phase_sink(channel: &Channel<ArchiveProgress>, phase: &'static str) -> ProgressSink {
    let channel = channel.clone();
    ProgressSink::new(move |event| {
        let _ = channel.send(ArchiveProgress {
            phase,
            current: event.current,
            total: event.total,
        });
    })
}

#[tauri::command]
pub async fn create_support_archive(
    archives: tauri::State<'_, SupportArchives>,
    archive_id: String,
    project_path: String,
    on_progress: Channel<ArchiveProgress>,
) -> Result<ArchiveSummary, String> {
    check_archive_id(&archive_id)?;
    let cancel = archives.begin(&archive_id)?;
    let result = pack(
        Path::new(&project_path),
        Arc::clone(&cancel),
        phase_sink(&on_progress, "packing"),
        phase_sink(&on_progress, "checking"),
    )
    .await;
    match result {
        Ok((packed, summary)) => {
            if archives.finish(&archive_id, packed) {
                Ok(summary)
            } else {
                Err(err(CANCELLED, "the archive was discarded"))
            }
        }
        Err(error) => {
            archives.discard(&archive_id);
            check_cancelled(&cancel)?;
            Err(error)
        }
    }
}

// ---------- Upload ----------

#[derive(Debug, Deserialize)]
pub struct RequiredHeader {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadResult {
    /// Storage refused the upload because it already holds the file.
    pub already_stored: bool,
}

/// The link's headers, exactly, and the zip's length. A header the request
/// sets itself is refused.
fn upload_headers(
    headers: &[RequiredHeader],
    size_bytes: u64,
) -> Result<reqwest::header::HeaderMap, String> {
    use reqwest::header::{
        CONTENT_LENGTH, HOST, HeaderMap, HeaderName, HeaderValue, TRANSFER_ENCODING,
    };

    if headers.len() > MAX_HEADERS {
        return Err(err(INVALID_REQUEST, "too many upload headers"));
    }
    let mut map = HeaderMap::new();
    for header in headers {
        let name = HeaderName::from_bytes(header.name.as_bytes())
            .map_err(|error| err(INVALID_REQUEST, error))?;
        if [CONTENT_LENGTH, HOST, TRANSFER_ENCODING].contains(&name) {
            return Err(err(INVALID_REQUEST, format!("{name} cannot be set")));
        }
        let value =
            HeaderValue::from_str(&header.value).map_err(|error| err(INVALID_REQUEST, error))?;
        map.append(name, value);
    }
    map.insert(CONTENT_LENGTH, HeaderValue::from(size_bytes));
    Ok(map)
}

fn upload_client() -> Result<reqwest::Client, String> {
    crate::download::install_tls_provider();
    // No read timeout: the response only starts after the last byte is
    // sent. The upload watches for stalls itself.
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| err(UPLOAD_FAILED, error))
}

/// The zip in chunks, counting the bytes handed to the connection, and
/// failing once `cancel` is set.
fn body_stream(
    file: tokio::fs::File,
    sent: Arc<AtomicU64>,
    cancel: Arc<AtomicBool>,
) -> impl futures_util::Stream<Item = std::io::Result<Vec<u8>>> {
    futures_util::stream::unfold(Some(file), move |state| {
        let sent = Arc::clone(&sent);
        let cancel = Arc::clone(&cancel);
        async move {
            let mut file = state?;
            if cancel.load(Ordering::SeqCst) {
                return Some((Err(std::io::Error::other("cancelled")), None));
            }
            let mut buffer = vec![0u8; CHUNK_BYTES];
            match file.read(&mut buffer).await {
                Ok(0) => None,
                Ok(read) => {
                    buffer.truncate(read);
                    sent.fetch_add(read as u64, Ordering::SeqCst);
                    Some((Ok(buffer), Some(file)))
                }
                Err(error) => Some((Err(error), None)),
            }
        }
    })
}

async fn upload(
    zip: &Path,
    size_bytes: u64,
    url: &str,
    headers: &[RequiredHeader],
    cancel: Arc<AtomicBool>,
    progress: &mut ProgressSink,
) -> Result<UploadResult, String> {
    let url = Url::parse(url).map_err(|error| err(INVALID_REQUEST, error))?;
    crate::download::validate_url(&url).map_err(|error| err(INVALID_REQUEST, error))?;
    let headers = upload_headers(headers, size_bytes)?;
    check_cancelled(&cancel)?;
    let file = tokio::fs::File::open(zip)
        .await
        .map_err(|error| err(UPLOAD_FAILED, error))?;
    let sent = Arc::new(AtomicU64::new(0));
    let body =
        reqwest::Body::wrap_stream(body_stream(file, Arc::clone(&sent), Arc::clone(&cancel)));
    let mut request = Box::pin(upload_client()?.put(url).headers(headers).body(body).send());

    progress.emit(0, size_bytes);
    let mut last_sent = 0u64;
    let mut last_change = Instant::now();
    let response = loop {
        match tokio::time::timeout(TICK, &mut request).await {
            Ok(result) => {
                check_cancelled(&cancel)?;
                break result.map_err(|error| err(UPLOAD_FAILED, error))?;
            }
            Err(_) => {
                check_cancelled(&cancel)?;
                let now_sent = sent.load(Ordering::SeqCst).min(size_bytes);
                progress.report(now_sent, size_bytes);
                if now_sent != last_sent {
                    last_sent = now_sent;
                    last_change = Instant::now();
                }
                let limit = if now_sent < size_bytes {
                    STALL_LIMIT
                } else {
                    RESPONSE_LIMIT
                };
                if last_change.elapsed() > limit {
                    return Err(err(UPLOAD_FAILED, "the upload stalled"));
                }
            }
        }
    };

    let status = response.status();
    if status == reqwest::StatusCode::PRECONDITION_FAILED {
        return Ok(UploadResult {
            already_stored: true,
        });
    }
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let detail: String = body.chars().take(MAX_ERROR_BODY).collect();
        return Err(err(UPLOAD_FAILED, format!("HTTP {status}: {detail}")));
    }
    progress.emit(size_bytes, size_bytes);
    Ok(UploadResult {
        already_stored: false,
    })
}

#[tauri::command]
pub async fn upload_support_archive(
    archives: tauri::State<'_, SupportArchives>,
    archive_id: String,
    url: String,
    headers: Vec<RequiredHeader>,
    on_progress: Channel<ProgressEvent>,
) -> Result<UploadResult, String> {
    let (zip, size_bytes, cancel) = archives.packed(&archive_id)?;
    let mut progress = channel_sink(on_progress);
    upload(&zip, size_bytes, &url, &headers, cancel, &mut progress).await
}

#[tauri::command]
pub fn cancel_support_archive(archives: tauri::State<'_, SupportArchives>, archive_id: String) {
    archives.cancel(&archive_id);
}

#[tauri::command]
pub fn discard_support_archive(archives: tauri::State<'_, SupportArchives>, archive_id: String) {
    archives.discard(&archive_id);
}

// ---------- Device facts ----------

/// What the system says of the device, for support. Each fact that can't be
/// read is left out. Names and serial numbers are never read.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportDeviceFacts {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub os_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arch: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub web_view_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memory_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub free_disk_bytes: Option<u64>,
}

fn arch() -> Option<&'static str> {
    match std::env::consts::ARCH {
        "x86_64" => Some("x86_64"),
        "x86" => Some("i686"),
        "aarch64" => Some("aarch64"),
        "arm" => Some("armv7"),
        _ => None,
    }
}

#[cfg(target_os = "linux")]
fn total_memory_bytes() -> Option<u64> {
    let meminfo = fs::read_to_string("/proc/meminfo").ok()?;
    let line = meminfo.lines().find(|line| line.starts_with("MemTotal:"))?;
    let kib: u64 = line.split_whitespace().nth(1)?.parse().ok()?;
    kib.checked_mul(1024)
}

#[cfg(target_os = "macos")]
fn total_memory_bytes() -> Option<u64> {
    let mut value = 0u64;
    let mut size = std::mem::size_of::<u64>();
    // SAFETY: `value` is a u64 and `size` holds its length.
    let result = unsafe {
        libc::sysctlbyname(
            c"hw.memsize".as_ptr(),
            (&raw mut value).cast(),
            &raw mut size,
            std::ptr::null_mut(),
            0,
        )
    };
    (result == 0 && size == std::mem::size_of::<u64>()).then_some(value)
}

#[cfg(target_os = "windows")]
fn total_memory_bytes() -> Option<u64> {
    use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};

    let mut status = MEMORYSTATUSEX {
        dwLength: u32::try_from(std::mem::size_of::<MEMORYSTATUSEX>()).ok()?,
        ..Default::default()
    };
    // SAFETY: `status` is a MEMORYSTATUSEX with its length set.
    unsafe { GlobalMemoryStatusEx(&raw mut status) }.ok()?;
    Some(status.ullTotalPhys)
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn total_memory_bytes() -> Option<u64> {
    None
}

#[cfg(unix)]
fn free_disk_bytes(path: &Path) -> Option<u64> {
    use std::os::unix::ffi::OsStrExt;

    let path = std::ffi::CString::new(path.as_os_str().as_bytes()).ok()?;
    let mut stats = std::mem::MaybeUninit::<libc::statvfs>::uninit();
    // SAFETY: `path` is NUL-terminated and `stats` is written on success.
    if unsafe { libc::statvfs(path.as_ptr(), stats.as_mut_ptr()) } != 0 {
        return None;
    }
    // SAFETY: statvfs returned 0, so it filled `stats`.
    let stats = unsafe { stats.assume_init() };
    #[allow(clippy::unnecessary_cast)]
    (stats.f_bavail as u64).checked_mul(stats.f_frsize as u64)
}

#[cfg(windows)]
fn free_disk_bytes(path: &Path) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    use windows::core::PCWSTR;

    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut available = 0u64;
    // SAFETY: `wide` is NUL-terminated and outlives the call.
    unsafe { GetDiskFreeSpaceExW(PCWSTR(wide.as_ptr()), Some(&raw mut available), None, None) }
        .ok()?;
    Some(available)
}

#[cfg(not(any(unix, windows)))]
fn free_disk_bytes(_path: &Path) -> Option<u64> {
    None
}

#[tauri::command]
pub async fn get_support_device_facts(project_path: String) -> Result<SupportDeviceFacts, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (model, os_version) = crate::update_device_info::platform_device_info();
        SupportDeviceFacts {
            os_version,
            model,
            arch: arch(),
            web_view_version: crate::update_device_info::platform_webview_version(),
            memory_bytes: total_memory_bytes(),
            free_disk_bytes: free_disk_bytes(Path::new(&project_path)),
        }
    })
    .await
    .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::download::tests::recording;
    use std::net::TcpListener;

    fn runtime() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
    }

    fn silent() -> ProgressSink {
        ProgressSink::new(|_| {})
    }

    /// A project folder whose database is in WAL mode and still has its last
    /// write only in the write-ahead log, held open by the returned
    /// connection like the app's own.
    fn wal_project(rt: &tokio::runtime::Runtime) -> (tempfile::TempDir, SqliteConnection) {
        let folder = tempfile::tempdir().unwrap();
        let files = folder.path().join("files");
        fs::create_dir(&files).unwrap();
        fs::write(files.join("FileOne"), b"image bytes").unwrap();
        fs::write(files.join(".DS_Store"), b"ignored").unwrap();
        fs::create_dir(files.join("nested")).unwrap();
        fs::create_dir(folder.path().join("file-metadata")).unwrap();
        fs::write(folder.path().join("file-metadata/FileOne"), b"{}").unwrap();
        fs::write(folder.path().join("notes.txt"), b"not part of a project").unwrap();
        let options = SqliteConnectOptions::new()
            .filename(folder.path().join(PROJECT_DATABASE))
            .create_if_missing(true);
        let connection = rt.block_on(async {
            let mut connection = SqliteConnection::connect_with(&options).await.unwrap();
            for sql in [
                "PRAGMA journal_mode=WAL",
                "PRAGMA wal_autocheckpoint=0",
                "CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT)",
                "INSERT INTO kv VALUES ('name', 'Project One')",
            ] {
                sqlx::query(sql).execute(&mut connection).await.unwrap();
            }
            connection
        });
        (folder, connection)
    }

    fn zip_entries(zip: &Path) -> Vec<(String, Vec<u8>)> {
        let mut archive = zip::ZipArchive::new(File::open(zip).unwrap()).unwrap();
        (0..archive.len())
            .map(|index| {
                let mut entry = archive.by_index(index).unwrap();
                let mut bytes = Vec::new();
                entry.read_to_end(&mut bytes).unwrap();
                (entry.name().to_string(), bytes)
            })
            .collect()
    }

    fn read_name(rt: &tokio::runtime::Runtime, database: &Path) -> String {
        rt.block_on(async {
            let options = SqliteConnectOptions::new().filename(database);
            let mut connection = SqliteConnection::connect_with(&options).await.unwrap();
            sqlx::query_scalar("SELECT value FROM kv WHERE key = 'name'")
                .fetch_one(&mut connection)
                .await
                .unwrap()
        })
    }

    #[test]
    fn packs_the_open_project_as_the_zip_import_reads_it() {
        let rt = runtime();
        let (project, _open) = wal_project(&rt);
        assert!(project.path().join("project.db-wal").exists());
        let (packing, packed_events) = recording();
        let (packed, summary) = rt
            .block_on(pack(
                project.path(),
                Arc::new(AtomicBool::new(false)),
                packing,
                silent(),
            ))
            .unwrap();

        let entries = zip_entries(&packed.zip);
        let names: Vec<_> = entries.iter().map(|entry| entry.0.as_str()).collect();
        assert_eq!(
            names,
            [
                "project/project.db",
                "project/files/FileOne",
                "project/file-metadata/FileOne"
            ]
        );
        assert_eq!(entries[1].1, b"image bytes");
        // The copy holds the write that was only in the write-ahead log.
        let copy = tempfile::tempdir().unwrap();
        fs::write(copy.path().join("project.db"), &entries[0].1).unwrap();
        assert_eq!(
            read_name(&rt, &copy.path().join("project.db")),
            "Project One"
        );

        let bytes = fs::read(&packed.zip).unwrap();
        assert_eq!(summary.size_bytes, bytes.len() as u64);
        let expected: String = Sha256::digest(&bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        assert_eq!(summary.sha256, expected);
        let events = packed_events.lock().unwrap();
        let (last_current, last_total) = *events.last().unwrap();
        assert_eq!(last_current, last_total);
        // Only the zip is left in the temporary folder.
        let left: Vec<_> = fs::read_dir(packed.zip.parent().unwrap())
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert_eq!(left, [ZIP_NAME]);
    }

    #[test]
    fn packing_the_same_project_twice_gives_the_same_sha256() {
        let rt = runtime();
        let (project, _open) = wal_project(&rt);
        let run = || {
            rt.block_on(pack(
                project.path(),
                Arc::new(AtomicBool::new(false)),
                silent(),
                silent(),
            ))
            .unwrap()
            .1
            .sha256
        };
        assert_eq!(run(), run());
    }

    #[test]
    fn packing_refuses_a_folder_without_a_project_and_stops_when_cancelled() {
        let rt = runtime();
        let empty = tempfile::tempdir().unwrap();
        let error = rt
            .block_on(pack(
                empty.path(),
                Arc::new(AtomicBool::new(false)),
                silent(),
                silent(),
            ))
            .err()
            .unwrap();
        assert!(error.starts_with("packFailed:"), "{error}");

        let (project, _open) = wal_project(&rt);
        let error = rt
            .block_on(pack(
                project.path(),
                Arc::new(AtomicBool::new(true)),
                silent(),
                silent(),
            ))
            .err()
            .unwrap();
        assert!(error.starts_with("cancelled:"), "{error}");
    }

    #[test]
    fn archives_are_kept_by_id_until_discarded() {
        let archives = SupportArchives::default();
        assert!(check_archive_id("Abc123").is_ok());
        assert!(check_archive_id("../x").is_err());
        assert!(check_archive_id("").is_err());
        let cancel = archives.begin("one").unwrap();
        assert!(archives.begin("one").is_err());
        assert!(
            archives
                .packed("one")
                .unwrap_err()
                .starts_with("invalidRequest:")
        );
        archives.cancel("one");
        assert!(cancel.load(Ordering::SeqCst));

        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().to_path_buf();
        let packed = Packed {
            _folder: folder,
            zip: path.join(ZIP_NAME),
            size_bytes: 3,
        };
        assert!(archives.finish("one", packed));
        assert_eq!(archives.packed("one").unwrap().1, 3);
        archives.discard("one");
        assert!(!path.exists());
        assert!(archives.packed("one").is_err());

        // Packing that ends after a discard has nowhere to put its zip.
        let folder = tempfile::tempdir().unwrap();
        let packed = Packed {
            zip: folder.path().join(ZIP_NAME),
            _folder: folder,
            size_bytes: 1,
        };
        assert!(!archives.finish("gone", packed));
    }

    #[test]
    fn upload_headers_are_the_links_and_the_length() {
        let headers = upload_headers(
            &[
                RequiredHeader {
                    name: "If-None-Match".into(),
                    value: "*".into(),
                },
                RequiredHeader {
                    name: "x-amz-checksum-sha256".into(),
                    value: "n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=".into(),
                },
            ],
            42,
        )
        .unwrap();
        assert_eq!(headers["if-none-match"], "*");
        assert_eq!(headers["content-length"], "42");
        for name in ["Content-Length", "Host", "Transfer-Encoding"] {
            let refused = upload_headers(
                &[RequiredHeader {
                    name: name.into(),
                    value: "1".into(),
                }],
                1,
            );
            assert!(refused.unwrap_err().starts_with("invalidRequest:"));
        }
        assert!(
            upload_headers(
                &[RequiredHeader {
                    name: "bad header".into(),
                    value: "1".into(),
                }],
                1
            )
            .is_err()
        );
    }

    /// Answers one request with `status` and returns what it received.
    fn spawn_storage(status: &'static str) -> (String, std::thread::JoinHandle<Vec<u8>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/bucket/key", listener.local_addr().unwrap());
        let handle = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut received = Vec::new();
            let mut buffer = [0u8; 8192];
            loop {
                let read = stream.read(&mut buffer).unwrap();
                received.extend_from_slice(&buffer[..read]);
                let text = String::from_utf8_lossy(&received);
                if let Some(end) = text.find("\r\n\r\n") {
                    let length = text[..end]
                        .lines()
                        .find_map(|line| {
                            let (name, value) = line.split_once(':')?;
                            name.eq_ignore_ascii_case("content-length")
                                .then(|| value.trim().parse::<usize>().unwrap())
                        })
                        .unwrap_or(0);
                    if received.len() >= end + 4 + length {
                        break;
                    }
                }
                if read == 0 {
                    break;
                }
            }
            let response =
                format!("HTTP/1.1 {status}\r\nContent-Length: 4\r\nConnection: close\r\n\r\nnope");
            stream.write_all(response.as_bytes()).unwrap();
            received
        });
        (url, handle)
    }

    fn zip_file(bytes: &[u8]) -> (tempfile::TempDir, PathBuf) {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join(ZIP_NAME);
        fs::write(&path, bytes).unwrap();
        (folder, path)
    }

    fn if_none_match() -> Vec<RequiredHeader> {
        vec![RequiredHeader {
            name: "If-None-Match".into(),
            value: "*".into(),
        }]
    }

    #[test]
    fn upload_sends_the_zip_with_its_length_and_the_links_headers() {
        let rt = runtime();
        let body = vec![7u8; 600 * 1024];
        let (_folder, zip) = zip_file(&body);
        let (url, server) = spawn_storage("200 OK");
        let (mut progress, events) = recording();
        let result = rt
            .block_on(upload(
                &zip,
                body.len() as u64,
                &url,
                &if_none_match(),
                Arc::new(AtomicBool::new(false)),
                &mut progress,
            ))
            .unwrap();
        assert!(!result.already_stored);

        let received = server.join().unwrap();
        let end = received.windows(4).position(|w| w == b"\r\n\r\n").unwrap();
        let head = String::from_utf8_lossy(&received[..end]).to_lowercase();
        assert!(head.starts_with("put /bucket/key http/1.1"), "{head}");
        assert!(head.contains(&format!("content-length: {}", body.len())));
        assert!(head.contains("if-none-match: *"));
        assert!(!head.contains("transfer-encoding"));
        assert_eq!(&received[end + 4..], body.as_slice());
        let events = events.lock().unwrap();
        assert_eq!(
            *events.last().unwrap(),
            (body.len() as u64, body.len() as u64)
        );
    }

    #[test]
    fn a_412_means_storage_already_holds_the_file() {
        let rt = runtime();
        let (_folder, zip) = zip_file(b"zip");
        let (url, server) = spawn_storage("412 Precondition Failed");
        let result = rt
            .block_on(upload(
                &zip,
                3,
                &url,
                &if_none_match(),
                Arc::new(AtomicBool::new(false)),
                &mut silent(),
            ))
            .unwrap();
        assert!(result.already_stored);
        server.join().unwrap();
    }

    #[test]
    fn other_statuses_fail_the_upload_with_the_storage_answer() {
        let rt = runtime();
        let (_folder, zip) = zip_file(b"zip");
        let (url, server) = spawn_storage("403 Forbidden");
        let error = rt
            .block_on(upload(
                &zip,
                3,
                &url,
                &[],
                Arc::new(AtomicBool::new(false)),
                &mut silent(),
            ))
            .unwrap_err();
        assert!(error.starts_with("uploadFailed: HTTP 403"), "{error}");
        assert!(error.ends_with("nope"), "{error}");
        server.join().unwrap();
    }

    #[test]
    fn upload_refuses_other_hosts_over_http_and_stops_when_cancelled() {
        let rt = runtime();
        let (_folder, zip) = zip_file(b"zip");
        let refused = |url: &str| {
            rt.block_on(upload(
                &zip,
                3,
                url,
                &[],
                Arc::new(AtomicBool::new(false)),
                &mut silent(),
            ))
            .unwrap_err()
        };
        assert!(refused("http://storage.example/key").starts_with("invalidRequest:"));
        assert!(refused("https://user:pass@storage.example/key").starts_with("invalidRequest:"));

        let error = rt
            .block_on(upload(
                &zip,
                3,
                "http://127.0.0.1:9/key",
                &[],
                Arc::new(AtomicBool::new(true)),
                &mut silent(),
            ))
            .unwrap_err();
        assert!(error.starts_with("cancelled:"), "{error}");
    }

    #[test]
    fn a_cancel_during_the_upload_stops_it() {
        let rt = runtime();
        let body = vec![1u8; 4 * 1024 * 1024];
        let (_folder, zip) = zip_file(&body);
        // Storage that accepts the connection and never reads, so the body
        // stays unsent until the cancel.
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/key", listener.local_addr().unwrap());
        let _held = std::thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            std::thread::sleep(Duration::from_secs(5));
            drop(stream);
        });
        let cancel = Arc::new(AtomicBool::new(false));
        let trigger = Arc::clone(&cancel);
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(300));
            trigger.store(true, Ordering::SeqCst);
        });
        let started = Instant::now();
        let error = rt
            .block_on(upload(
                &zip,
                body.len() as u64,
                &url,
                &[],
                cancel,
                &mut silent(),
            ))
            .unwrap_err();
        assert!(error.starts_with("cancelled:"), "{error}");
        assert!(started.elapsed() < Duration::from_secs(3));
    }

    #[test]
    fn device_facts_fit_what_support_keeps() {
        let folder = tempfile::tempdir().unwrap();
        let facts = runtime()
            .block_on(get_support_device_facts(
                folder.path().to_string_lossy().into_owned(),
            ))
            .unwrap();
        assert!(facts.memory_bytes.is_some_and(|bytes| bytes > 0));
        assert!(facts.free_disk_bytes.is_some());
        assert!(facts.arch.is_some());
        let json = serde_json::to_value(&facts).unwrap();
        for key in json.as_object().unwrap().keys() {
            assert!(
                [
                    "osVersion",
                    "model",
                    "arch",
                    "webViewVersion",
                    "memoryBytes",
                    "freeDiskBytes"
                ]
                .contains(&key.as_str()),
                "{key}"
            );
        }
        let missing = runtime()
            .block_on(get_support_device_facts("/no/such/folder".into()))
            .unwrap();
        assert!(missing.free_disk_bytes.is_none());
    }
}
