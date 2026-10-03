//! Native building blocks for project import: stream a download to disk, list a
//! zip and extract chosen entries. Everything else about import (zip layout,
//! names, limits, stages, folder naming) lives in JavaScript; see the
//! "Native contract" section of `docs/project-import.md`.

use std::collections::HashSet;
use std::fmt::Display;
use std::fs::{self, File, OpenOptions};
use std::io::{ErrorKind, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;
use url::Url;

const INVALID_URL: &str = "invalidUrl";
const DOWNLOAD_FAILED: &str = "downloadFailed";
const ARCHIVE_TOO_LARGE: &str = "archiveTooLarge";
const INVALID_ARCHIVE: &str = "invalidArchive";
const UNSAFE_ARCHIVE_ENTRY: &str = "unsafeArchiveEntry";
const IMPORT_FAILED: &str = "importFailed";

const MAX_REDIRECTS: u32 = 5;
const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);

fn err(code: &str, detail: impl Display) -> String {
    format!("{code}: {detail}")
}

// ---------- Progress ----------

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEvent {
    pub current: u64,
    pub total: u64,
}

/// Sends `{ current, total }` events: `emit` always sends (first and last
/// event), `report` sends at most one event per 100 ms. Delivery is best
/// effort, so the sender cannot fail the operation.
pub struct ProgressSink {
    send: Box<dyn Fn(ProgressEvent) + Send + Sync>,
    last_sent: Option<Instant>,
}

impl ProgressSink {
    fn new(send: impl Fn(ProgressEvent) + Send + Sync + 'static) -> Self {
        Self {
            send: Box::new(send),
            last_sent: None,
        }
    }

    fn emit(&mut self, current: u64, total: u64) {
        (self.send)(ProgressEvent { current, total });
        self.last_sent = Some(Instant::now());
    }

    fn report(&mut self, current: u64, total: u64) {
        if self
            .last_sent
            .is_none_or(|last| last.elapsed() >= PROGRESS_INTERVAL)
        {
            self.emit(current, total);
        }
    }
}

fn channel_sink(channel: tauri::ipc::Channel<ProgressEvent>) -> ProgressSink {
    ProgressSink::new(move |event| {
        let _ = channel.send(event);
    })
}

async fn run_blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| err(IMPORT_FAILED, format!("blocking task failed: {error}")))?
}

// ---------- download_file ----------

fn is_loopback_host(url: &Url) -> bool {
    matches!(
        url.host(),
        Some(url::Host::Domain("localhost"))
            | Some(url::Host::Ipv4(std::net::Ipv4Addr::LOCALHOST))
            | Some(url::Host::Ipv6(std::net::Ipv6Addr::LOCALHOST))
    )
}

fn validate_url(url: &Url) -> Result<(), String> {
    if !url.username().is_empty() || url.password().is_some() {
        return Err(err(INVALID_URL, "credentials in URL are not allowed"));
    }
    let scheme = url.scheme();
    if scheme == "https" || (scheme == "http" && is_loopback_host(url)) {
        return Ok(());
    }
    Err(err(
        INVALID_URL,
        format!("scheme {scheme} is not allowed for this host"),
    ))
}

fn build_http_client() -> Result<reqwest::Client, String> {
    // rustls-no-provider reqwest builds need a process-default CryptoProvider.
    // Install the ring provider once, mirroring error_reporting::init; if a
    // provider is already installed (production startup), this is a no-op.
    static INSTALL_TLS_PROVIDER: std::sync::Once = std::sync::Once::new();
    INSTALL_TLS_PROVIDER.call_once(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| err(DOWNLOAD_FAILED, error))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResult {
    pub final_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_disposition: Option<String>,
    pub bytes: u64,
}

// Redirects are followed by hand so every hop passes the same URL check. The
// body is streamed chunk by chunk and never held in memory.
async fn fetch_into(
    client: &reqwest::Client,
    start_url: Url,
    writer: &mut tokio::fs::File,
    max_bytes: u64,
    progress: &mut ProgressSink,
) -> Result<DownloadResult, String> {
    let mut current = start_url;
    let mut redirects = 0u32;
    let response = loop {
        validate_url(&current)?;
        let response = client
            .get(current.clone())
            .send()
            .await
            .map_err(|error| err(DOWNLOAD_FAILED, error))?;
        let status = response.status();
        if !status.is_redirection() {
            if !status.is_success() {
                return Err(err(DOWNLOAD_FAILED, format!("HTTP {status}")));
            }
            break response;
        }
        if redirects >= MAX_REDIRECTS {
            return Err(err(
                DOWNLOAD_FAILED,
                format!("too many redirects (HTTP {status})"),
            ));
        }
        let location = response
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|value| value.to_str().ok())
            .ok_or_else(|| {
                err(
                    DOWNLOAD_FAILED,
                    format!("redirect without location (HTTP {status})"),
                )
            })?;
        redirects += 1;
        current = current
            .join(location)
            .map_err(|error| err(INVALID_URL, error))?;
    };

    let content_length = response.content_length().unwrap_or(0);
    if content_length > max_bytes {
        return Err(err(
            ARCHIVE_TOO_LARGE,
            format!("server declares {content_length} bytes, limit is {max_bytes}"),
        ));
    }
    let content_disposition = response
        .headers()
        .get(reqwest::header::CONTENT_DISPOSITION)
        .map(|value| String::from_utf8_lossy(value.as_bytes()).into_owned());

    // The first event waits for the response headers so the caller can keep
    // showing "connecting" until the server answers.
    progress.emit(0, content_length);
    let mut stream = response.bytes_stream();
    let mut bytes = 0u64;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| err(DOWNLOAD_FAILED, error))?;
        bytes += chunk.len() as u64;
        if bytes > max_bytes {
            return Err(err(
                ARCHIVE_TOO_LARGE,
                format!("download passed the limit of {max_bytes} bytes"),
            ));
        }
        writer
            .write_all(&chunk)
            .await
            .map_err(|error| err(IMPORT_FAILED, error))?;
        progress.report(bytes, content_length);
    }
    writer
        .flush()
        .await
        .map_err(|error| err(IMPORT_FAILED, error))?;
    progress.emit(bytes, content_length);
    Ok(DownloadResult {
        final_url: current.to_string(),
        content_disposition,
        bytes,
    })
}

async fn download(
    url: &str,
    destination: &Path,
    max_bytes: u64,
    progress: &mut ProgressSink,
) -> Result<DownloadResult, String> {
    let start_url = Url::parse(url).map_err(|error| err(INVALID_URL, error))?;
    validate_url(&start_url)?;
    let client = build_http_client()?;
    // The destination is new: an existing file is never overwritten, and it is
    // only deleted again (on failure) when this call created it.
    let mut writer = tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)
        .await
        .map_err(|error| {
            err(
                IMPORT_FAILED,
                format!("cannot create {}: {error}", destination.display()),
            )
        })?;
    let result = fetch_into(&client, start_url, &mut writer, max_bytes, progress).await;
    drop(writer);
    if result.is_err() {
        let _ = tokio::fs::remove_file(destination).await;
    }
    result
}

#[tauri::command]
pub async fn download_file(
    url: String,
    destination: String,
    max_bytes: u64,
    on_progress: tauri::ipc::Channel<ProgressEvent>,
) -> Result<DownloadResult, String> {
    let mut progress = channel_sink(on_progress);
    download(&url, Path::new(&destination), max_bytes, &mut progress).await
}

// ---------- list_archive ----------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveEntry {
    pub name: String,
    pub size: u64,
    pub is_directory: bool,
}

#[derive(Debug, Serialize)]
pub struct ArchiveListing {
    pub entries: Vec<ArchiveEntry>,
}

fn open_archive(archive: &Path) -> Result<zip::ZipArchive<File>, String> {
    let file = File::open(archive).map_err(|error| {
        err(
            IMPORT_FAILED,
            format!("cannot open {}: {error}", archive.display()),
        )
    })?;
    zip::ZipArchive::new(file).map_err(|error| err(INVALID_ARCHIVE, error))
}

fn list(archive_path: &Path, max_entries: u64) -> Result<ArchiveListing, String> {
    let mut archive = open_archive(archive_path)?;
    if archive.len() as u64 > max_entries {
        return Err(err(
            INVALID_ARCHIVE,
            format!(
                "archive has {} entries, limit is {max_entries}",
                archive.len()
            ),
        ));
    }
    let mut entries = Vec::with_capacity(archive.len());
    for index in 0..archive.len() {
        let entry = archive
            .by_index_raw(index)
            .map_err(|error| err(INVALID_ARCHIVE, error))?;
        entries.push(ArchiveEntry {
            name: entry.name().to_string(),
            size: entry.size(),
            is_directory: entry.is_dir(),
        });
    }
    Ok(ArchiveListing { entries })
}

#[tauri::command]
pub async fn list_archive(archive: String, max_entries: u64) -> Result<ArchiveListing, String> {
    run_blocking(move || list(Path::new(&archive), max_entries)).await
}

// ---------- extract_archive ----------

#[derive(Debug, Deserialize)]
pub struct ExtractFile {
    pub entry: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct ExtractResult {
    pub files: u64,
    pub bytes: u64,
}

struct PlannedFile {
    index: usize,
    segments: Vec<String>,
    size: u64,
}

/// A destination path is relative and made of plain names: no absolute path,
/// empty, `.` or `..` segment, backslash, `:` or NUL.
fn destination_segments(path: &str) -> Result<Vec<String>, String> {
    let unsafe_path = |reason: &str| err(UNSAFE_ARCHIVE_ENTRY, format!("{reason}: {path:?}"));
    if path.contains(['\0', '\\', ':']) {
        return Err(unsafe_path("NUL, backslash or colon in destination path"));
    }
    if path.starts_with('/') {
        return Err(unsafe_path("absolute destination path"));
    }
    let mut segments = Vec::new();
    for segment in path.split('/') {
        match segment {
            "" => return Err(unsafe_path("empty segment in destination path")),
            "." | ".." => return Err(unsafe_path("relative segment in destination path")),
            _ => segments.push(segment.to_string()),
        }
    }
    Ok(segments)
}

/// Resolves and checks the whole request before anything is written.
fn plan_extraction(
    archive: &zip::ZipArchive<File>,
    files: &[ExtractFile],
) -> Result<Vec<PlannedFile>, String> {
    let mut claimed = HashSet::new();
    let mut planned = Vec::with_capacity(files.len());
    for file in files {
        let segments = destination_segments(&file.path)?;
        if !claimed.insert(file.path.to_lowercase()) {
            return Err(err(
                INVALID_ARCHIVE,
                format!("more than one entry is extracted to {:?}", file.path),
            ));
        }
        let index = archive.index_for_name(&file.entry).ok_or_else(|| {
            err(
                INVALID_ARCHIVE,
                format!("archive has no entry {:?}", file.entry),
            )
        })?;
        planned.push(PlannedFile {
            index,
            segments,
            size: 0,
        });
    }
    Ok(planned)
}

#[derive(Default)]
struct Created {
    files: Vec<PathBuf>,
    dirs: Vec<PathBuf>,
}

impl Created {
    // Removes what this call created; a pre-existing file or folder is never
    // in these lists, and a folder that gained other content is left alone.
    fn remove_all(&self) {
        for file in self.files.iter().rev() {
            let _ = fs::remove_file(file);
        }
        for dir in self.dirs.iter().rev() {
            let _ = fs::remove_dir(dir);
        }
    }
}

// Creates the parent folders of `segments` one component at a time and refuses
// to pass through a symlink, so a planted link cannot redirect a write.
fn prepare_parents(
    destination: &Path,
    segments: &[String],
    created: &mut Created,
) -> Result<PathBuf, String> {
    let mut current = destination.to_path_buf();
    for segment in &segments[..segments.len() - 1] {
        current.push(segment);
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(err(
                    UNSAFE_ARCHIVE_ENTRY,
                    format!("{} is a symbolic link", current.display()),
                ));
            }
            Ok(metadata) if metadata.is_dir() => {}
            Ok(_) => {
                return Err(err(
                    IMPORT_FAILED,
                    format!("{} is not a folder", current.display()),
                ));
            }
            Err(error) if error.kind() == ErrorKind::NotFound => {
                fs::create_dir(&current).map_err(|error| err(IMPORT_FAILED, error))?;
                created.dirs.push(current.clone());
            }
            Err(error) => return Err(err(IMPORT_FAILED, error)),
        }
    }
    Ok(current.join(&segments[segments.len() - 1]))
}

fn extract_entries(
    archive: &mut zip::ZipArchive<File>,
    planned: &[PlannedFile],
    destination: &Path,
    max_bytes: u64,
    declared_total: u64,
    progress: &mut ProgressSink,
    created: &mut Created,
) -> Result<u64, String> {
    let mut written_total = 0u64;
    let mut buffer = vec![0u8; 64 * 1024];
    for file in planned {
        let out_path = prepare_parents(destination, &file.segments, created)?;
        let mut entry = archive
            .by_index(file.index)
            .map_err(|error| err(INVALID_ARCHIVE, error))?;
        // create_new never truncates an existing file and never opens through
        // a planted symlink; either one is an error.
        let mut out = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&out_path)
            .map_err(|error| {
                err(
                    IMPORT_FAILED,
                    format!("cannot create {}: {error}", out_path.display()),
                )
            })?;
        created.files.push(out_path);
        let mut entry_written = 0u64;
        // Read to EOF: the zip crate checks the CRC32 when the reader ends.
        loop {
            let read = entry.read(&mut buffer).map_err(|error| {
                err(
                    INVALID_ARCHIVE,
                    format!("cannot read entry {:?}: {error}", entry.name()),
                )
            })?;
            if read == 0 {
                break;
            }
            let read = read as u64;
            if written_total + read > max_bytes {
                return Err(err(
                    ARCHIVE_TOO_LARGE,
                    format!("extraction passed the limit of {max_bytes} bytes"),
                ));
            }
            entry_written += read;
            if entry_written > file.size {
                return Err(err(
                    INVALID_ARCHIVE,
                    format!(
                        "entry {:?} declares {} bytes but holds more",
                        entry.name(),
                        file.size
                    ),
                ));
            }
            out.write_all(&buffer[..read as usize])
                .map_err(|error| err(IMPORT_FAILED, error))?;
            written_total += read;
            progress.report(written_total, declared_total);
        }
        if entry_written != file.size {
            return Err(err(
                INVALID_ARCHIVE,
                format!(
                    "entry {:?} declares {} bytes but holds {entry_written}",
                    entry.name(),
                    file.size
                ),
            ));
        }
    }
    Ok(written_total)
}

fn extract(
    archive_path: &Path,
    destination: &Path,
    files: &[ExtractFile],
    max_bytes: u64,
    progress: &mut ProgressSink,
) -> Result<ExtractResult, String> {
    let mut archive = open_archive(archive_path)?;
    if !destination.is_dir() {
        return Err(err(
            IMPORT_FAILED,
            format!("{} is not a folder", destination.display()),
        ));
    }
    let mut planned = plan_extraction(&archive, files)?;
    let mut declared_total = 0u64;
    for file in &mut planned {
        let entry = archive
            .by_index_raw(file.index)
            .map_err(|error| err(INVALID_ARCHIVE, error))?;
        if entry.is_dir() {
            return Err(err(
                INVALID_ARCHIVE,
                format!("entry {:?} is a directory", entry.name()),
            ));
        }
        file.size = entry.size();
        declared_total = declared_total
            .checked_add(file.size)
            .ok_or_else(|| err(ARCHIVE_TOO_LARGE, "declared sizes overflow"))?;
    }
    if declared_total > max_bytes {
        return Err(err(
            ARCHIVE_TOO_LARGE,
            format!("entries declare {declared_total} bytes, limit is {max_bytes}"),
        ));
    }

    progress.emit(0, declared_total);
    let mut created = Created::default();
    let result = extract_entries(
        &mut archive,
        &planned,
        destination,
        max_bytes,
        declared_total,
        progress,
        &mut created,
    );
    match result {
        Ok(bytes) => {
            progress.emit(bytes, declared_total);
            Ok(ExtractResult {
                files: planned.len() as u64,
                bytes,
            })
        }
        Err(error) => {
            created.remove_all();
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn extract_archive(
    archive: String,
    destination: String,
    files: Vec<ExtractFile>,
    max_bytes: u64,
    on_progress: tauri::ipc::Channel<ProgressEvent>,
) -> Result<ExtractResult, String> {
    let mut progress = channel_sink(on_progress);
    run_blocking(move || {
        extract(
            Path::new(&archive),
            Path::new(&destination),
            &files,
            max_bytes,
            &mut progress,
        )
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    use std::sync::{Arc, Mutex};

    type Events = Arc<Mutex<Vec<ProgressEvent>>>;

    fn quiet() -> ProgressSink {
        ProgressSink::new(|_| {})
    }

    fn recording() -> (ProgressSink, Events) {
        let events = Events::default();
        let received = Arc::clone(&events);
        let sink = ProgressSink::new(move |event| received.lock().unwrap().push(event));
        (sink, events)
    }

    // ----- download -----

    fn spawn_server(responses: Vec<String>) -> Url {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            for response in responses {
                let Ok((mut stream, _)) = listener.accept() else {
                    break;
                };
                let mut buf = [0u8; 8192];
                let _ = stream.read(&mut buf);
                let _ = stream.write_all(response.as_bytes());
                let _ = stream.flush();
            }
        });
        Url::parse(&format!("http://{addr}/archive.zip")).unwrap()
    }

    fn ok_response(body: &str) -> String {
        format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
    }

    fn redirect_to(location: &str) -> String {
        format!(
            "HTTP/1.1 302 Found\r\nLocation: {location}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        )
    }

    fn run_download(
        url: &str,
        destination: &Path,
        max_bytes: u64,
    ) -> Result<DownloadResult, String> {
        tauri::async_runtime::block_on(download(url, destination, max_bytes, &mut quiet()))
    }

    #[test]
    fn download_writes_the_body_and_passes_content_disposition_through() {
        let body = "Project One archive ".repeat(10);
        let disposition =
            "attachment; filename*=UTF-8''Project%20One.zip; filename=\"Project One.zip\"";
        let url = spawn_server(vec![format!(
            "HTTP/1.1 200 OK\r\nContent-Disposition: {disposition}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )]);
        let dir = tempfile::tempdir().unwrap();
        let destination = dir.path().join("download.zip");
        let result = run_download(url.as_str(), &destination, 1024).unwrap();
        assert_eq!(fs::read(&destination).unwrap(), body.as_bytes());
        assert_eq!(result.bytes, body.len() as u64);
        assert_eq!(result.final_url, url.as_str());
        assert_eq!(result.content_disposition.as_deref(), Some(disposition));
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["finalUrl"], url.as_str());
        assert_eq!(json["contentDisposition"], disposition);
    }

    #[test]
    fn download_result_omits_a_missing_content_disposition() {
        let url = spawn_server(vec![ok_response("abc")]);
        let dir = tempfile::tempdir().unwrap();
        let result = run_download(url.as_str(), &dir.path().join("a.zip"), 1024).unwrap();
        assert_eq!(result.content_disposition, None);
        let json = serde_json::to_value(&result).unwrap();
        assert!(json.get("contentDisposition").is_none());
        assert_eq!(json["bytes"], 3);
    }

    #[test]
    fn download_follows_redirects_and_reports_the_final_url() {
        let url = spawn_server(vec![redirect_to("/next.zip"), ok_response("abc")]);
        let dir = tempfile::tempdir().unwrap();
        let destination = dir.path().join("a.zip");
        let result = run_download(url.as_str(), &destination, 1024).unwrap();
        assert_eq!(fs::read(&destination).unwrap(), b"abc");
        assert!(
            result.final_url.ends_with("/next.zip"),
            "{}",
            result.final_url
        );
    }

    #[test]
    fn download_rejects_a_redirect_to_a_disallowed_scheme() {
        for location in ["http://example.com/a.zip", "ftp://127.0.0.1/a.zip"] {
            let url = spawn_server(vec![redirect_to(location)]);
            let dir = tempfile::tempdir().unwrap();
            let destination = dir.path().join("a.zip");
            let error = run_download(url.as_str(), &destination, 1024).unwrap_err();
            assert!(error.starts_with("invalidUrl: "), "{location}: {error}");
            assert!(!destination.exists());
        }
    }

    #[test]
    fn download_gives_up_after_five_redirects() {
        // Five hops are followed; the sixth redirect fails.
        let url = spawn_server(vec![redirect_to("/archive.zip"); 10]);
        let dir = tempfile::tempdir().unwrap();
        let destination = dir.path().join("a.zip");
        let error = run_download(url.as_str(), &destination, 1024).unwrap_err();
        assert!(error.starts_with("downloadFailed: "), "{error}");
        assert!(error.contains("too many redirects"), "{error}");
        assert!(!destination.exists());

        let mut responses = vec![redirect_to("/archive.zip"); 5];
        responses.push(ok_response("abc"));
        let url = spawn_server(responses);
        run_download(url.as_str(), &dir.path().join("b.zip"), 1024).unwrap();
    }

    #[test]
    fn download_rejects_credentials_and_bad_urls_before_touching_the_disk() {
        let dir = tempfile::tempdir().unwrap();
        for url in [
            "https://user:secret@example.com/a.zip",
            "https://user@example.com/a.zip",
            "http://example.com/a.zip",
            "ftp://example.com/a.zip",
            "not a url",
        ] {
            let destination = dir.path().join("a.zip");
            let error = run_download(url, &destination, 1024).unwrap_err();
            assert!(error.starts_with("invalidUrl: "), "{url}: {error}");
            assert!(!destination.exists());
        }
    }

    #[test]
    fn download_reports_the_http_status_and_removes_the_file() {
        let url = spawn_server(vec![
            "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string(),
        ]);
        let dir = tempfile::tempdir().unwrap();
        let destination = dir.path().join("a.zip");
        let error = run_download(url.as_str(), &destination, 1024).unwrap_err();
        assert!(error.starts_with("downloadFailed: "), "{error}");
        assert!(error.contains("HTTP 404"), "{error}");
        assert!(!destination.exists());
    }

    #[test]
    fn download_fails_when_the_connection_cannot_be_made() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/a.zip", listener.local_addr().unwrap());
        drop(listener);
        let dir = tempfile::tempdir().unwrap();
        let destination = dir.path().join("a.zip");
        let error = run_download(&url, &destination, 1024).unwrap_err();
        assert!(error.starts_with("downloadFailed: "), "{error}");
        assert!(!error.contains("HTTP "), "{error}");
        assert!(!destination.exists());
    }

    #[test]
    fn download_enforces_max_bytes_and_removes_the_partial_file() {
        let body = "x".repeat(4096);
        let responses = [
            // The declared length is already too large.
            ok_response(&body),
            // No length: the limit is enforced on the streamed bytes.
            format!("HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n{body}"),
        ];
        for response in responses {
            let url = spawn_server(vec![response]);
            let dir = tempfile::tempdir().unwrap();
            let destination = dir.path().join("a.zip");
            let error = run_download(url.as_str(), &destination, 1024).unwrap_err();
            assert!(error.starts_with("archiveTooLarge: "), "{error}");
            assert!(!destination.exists());
        }
        let url = spawn_server(vec![ok_response(&body)]);
        let dir = tempfile::tempdir().unwrap();
        let result = run_download(url.as_str(), &dir.path().join("a.zip"), 4096).unwrap();
        assert_eq!(result.bytes, 4096);
    }

    #[test]
    fn download_never_overwrites_an_existing_destination() {
        let dir = tempfile::tempdir().unwrap();
        let destination = dir.path().join("a.zip");
        fs::write(&destination, "keep").unwrap();
        // No server is needed: the destination is claimed before connecting.
        let error = run_download("https://example.com/a.zip", &destination, 1024).unwrap_err();
        assert!(error.starts_with("importFailed: "), "{error}");
        assert_eq!(fs::read(&destination).unwrap(), b"keep");
    }

    #[test]
    fn download_progress_starts_at_zero_and_ends_at_the_body_length() {
        let body = "archive body ".repeat(100);
        let url = spawn_server(vec![ok_response(&body)]);
        let dir = tempfile::tempdir().unwrap();
        let (mut sink, events) = recording();
        tauri::async_runtime::block_on(download(
            url.as_str(),
            &dir.path().join("a.zip"),
            1 << 20,
            &mut sink,
        ))
        .unwrap();
        let events = events.lock().unwrap();
        assert!(events.len() >= 2);
        assert_eq!(events[0].current, 0);
        assert!(
            events
                .windows(2)
                .all(|pair| pair[0].current <= pair[1].current)
        );
        assert_eq!(events.last().unwrap().current, body.len() as u64);
        assert!(events.iter().all(|event| event.total == body.len() as u64));
    }

    #[test]
    fn download_sends_no_progress_before_the_response_headers() {
        let url = spawn_server(vec![
            "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string(),
        ]);
        let dir = tempfile::tempdir().unwrap();
        let (mut sink, events) = recording();
        tauri::async_runtime::block_on(download(
            url.as_str(),
            &dir.path().join("a.zip"),
            1024,
            &mut sink,
        ))
        .unwrap_err();
        assert!(events.lock().unwrap().is_empty());
    }

    #[test]
    fn progress_sink_throttles_reports_but_always_sends_emits() {
        let (mut sink, events) = recording();
        sink.emit(0, 10);
        for current in 1..5 {
            sink.report(current, 10);
        }
        assert_eq!(events.lock().unwrap().len(), 1);
        std::thread::sleep(PROGRESS_INTERVAL + Duration::from_millis(20));
        sink.report(5, 10);
        sink.emit(10, 10);
        let currents: Vec<u64> = events.lock().unwrap().iter().map(|e| e.current).collect();
        assert_eq!(currents, [0, 5, 10]);
    }

    // ----- zip fixtures -----

    fn zip_bytes(entries: &[(&str, &[u8])], method: zip::CompressionMethod) -> Vec<u8> {
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let options = zip::write::SimpleFileOptions::default().compression_method(method);
        for (name, data) in entries {
            if let Some(directory) = name.strip_suffix('/') {
                writer.add_directory(directory, options).unwrap();
            } else {
                writer.start_file(*name, options).unwrap();
                writer.write_all(data).unwrap();
            }
        }
        writer.finish().unwrap().into_inner()
    }

    fn stored_zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
        zip_bytes(entries, zip::CompressionMethod::Stored)
    }

    // Overwrites a little-endian u32 in the last central directory record.
    fn patch_central_u32(bytes: &mut [u8], field_offset: usize, value: u32) {
        let record = bytes
            .windows(4)
            .rposition(|window| window == b"PK\x01\x02")
            .unwrap();
        bytes[record + field_offset..record + field_offset + 4]
            .copy_from_slice(&value.to_le_bytes());
    }

    const CENTRAL_CRC: usize = 16;
    const CENTRAL_UNCOMPRESSED_SIZE: usize = 24;

    fn write_archive(dir: &Path, bytes: &[u8]) -> PathBuf {
        let path = dir.join("archive.zip");
        fs::write(&path, bytes).unwrap();
        path
    }

    fn file(entry: &str, path: &str) -> ExtractFile {
        ExtractFile {
            entry: entry.to_string(),
            path: path.to_string(),
        }
    }

    // ----- list_archive -----

    #[test]
    fn list_returns_raw_entry_names_sizes_and_directories() {
        let names = [
            "Project One/",
            "Project One/project.db",
            "../evil.txt",
            "/absolute.txt",
            "back\\slash.txt",
            "./dot.txt",
            "files//double.bin",
            "__MACOSX/._junk",
        ];
        let entries: Vec<(&str, &[u8])> = names.iter().map(|name| (*name, &b"12345"[..])).collect();
        let dir = tempfile::tempdir().unwrap();
        let archive = write_archive(
            dir.path(),
            &zip_bytes(&entries, zip::CompressionMethod::Deflated),
        );
        let listing = list(&archive, 100).unwrap();
        let listed: Vec<&str> = listing.entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(listed, names);
        assert!(listing.entries[0].is_directory);
        assert_eq!(listing.entries[0].size, 0);
        assert!(!listing.entries[1].is_directory);
        assert_eq!(listing.entries[1].size, 5);
        let json = serde_json::to_value(&listing).unwrap();
        assert_eq!(json["entries"][1]["isDirectory"], false);
        assert_eq!(json["entries"][1]["name"], "Project One/project.db");
    }

    #[test]
    fn list_rejects_data_that_is_not_a_zip() {
        let dir = tempfile::tempdir().unwrap();
        for bytes in [&b"just some text, not an archive"[..], &b""[..]] {
            let archive = write_archive(dir.path(), bytes);
            let error = list(&archive, 100).unwrap_err();
            assert!(error.starts_with("invalidArchive: "), "{error}");
        }
    }

    #[test]
    fn list_rejects_more_entries_than_the_limit() {
        let dir = tempfile::tempdir().unwrap();
        let archive = write_archive(
            dir.path(),
            &stored_zip(&[("a.txt", b"a"), ("b.txt", b"b"), ("c.txt", b"c")]),
        );
        assert_eq!(list(&archive, 3).unwrap().entries.len(), 3);
        let error = list(&archive, 2).unwrap_err();
        assert!(error.starts_with("invalidArchive: "), "{error}");
    }

    #[test]
    fn list_reports_a_missing_archive_file_as_import_failed() {
        let dir = tempfile::tempdir().unwrap();
        let error = list(&dir.path().join("missing.zip"), 10).unwrap_err();
        assert!(error.starts_with("importFailed: "), "{error}");
    }

    // ----- extract_archive -----

    fn run_extract(
        archive: &Path,
        destination: &Path,
        files: &[ExtractFile],
        max_bytes: u64,
    ) -> Result<ExtractResult, String> {
        extract(archive, destination, files, max_bytes, &mut quiet())
    }

    fn is_empty_dir(path: &Path) -> bool {
        fs::read_dir(path).unwrap().next().is_none()
    }

    #[test]
    fn extract_writes_only_the_requested_entries_to_the_requested_paths() {
        let dir = tempfile::tempdir().unwrap();
        let archive = write_archive(
            dir.path(),
            &zip_bytes(
                &[
                    ("Project One/", b""),
                    ("Project One/project.db", b"database"),
                    ("Project One/files/abc.png", b"picture"),
                    ("Project One/notes.txt", b"not requested"),
                    ("__MACOSX/Project One/._project.db", b"junk"),
                    (".DS_Store", b"junk"),
                ],
                zip::CompressionMethod::Deflated,
            ),
        );
        let destination = dir.path().join("out");
        fs::create_dir(&destination).unwrap();
        let result = run_extract(
            &archive,
            &destination,
            &[
                file("Project One/project.db", "project.db"),
                file("Project One/files/abc.png", "files/abc"),
            ],
            1024,
        )
        .unwrap();
        assert_eq!(result.files, 2);
        assert_eq!(result.bytes, 15);
        assert_eq!(
            fs::read(destination.join("project.db")).unwrap(),
            b"database"
        );
        assert_eq!(fs::read(destination.join("files/abc")).unwrap(), b"picture");
        let mut names: Vec<_> = fs::read_dir(&destination)
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        names.sort();
        assert_eq!(names, ["files", "project.db"]);
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["files"], 2);
        assert_eq!(json["bytes"], 15);
    }

    #[test]
    fn extract_progress_counts_written_bytes_against_the_declared_total() {
        let dir = tempfile::tempdir().unwrap();
        let big = vec![b'x'; 256 * 1024];
        let archive = write_archive(
            dir.path(),
            &stored_zip(&[("a.bin", &big), ("skipped.bin", &big), ("b.bin", b"tail")]),
        );
        let destination = dir.path().join("out");
        fs::create_dir(&destination).unwrap();
        let (mut sink, events) = recording();
        extract(
            &archive,
            &destination,
            &[file("a.bin", "a.bin"), file("b.bin", "b.bin")],
            1 << 20,
            &mut sink,
        )
        .unwrap();
        let events = events.lock().unwrap();
        let total = big.len() as u64 + 4;
        assert!(events.len() >= 2);
        assert_eq!(events[0].current, 0);
        assert!(
            events
                .windows(2)
                .all(|pair| pair[0].current <= pair[1].current)
        );
        assert!(events.iter().all(|event| event.total == total));
        assert_eq!(events.last().unwrap().current, total);
    }

    #[test]
    fn extract_rejects_unsafe_destination_paths_before_writing_anything() {
        let dir = tempfile::tempdir().unwrap();
        let archive = write_archive(dir.path(), &stored_zip(&[("a.txt", b"a"), ("b.txt", b"b")]));
        let destination = dir.path().join("out");
        fs::create_dir(&destination).unwrap();
        for path in [
            "",
            "/abs.txt",
            "a//b.txt",
            "dir/",
            "./a.txt",
            "dir/./a.txt",
            "../a.txt",
            "dir/../a.txt",
            "dir\\a.txt",
            "C:a.txt",
            "dir/a:b.txt",
            "a\0b.txt",
        ] {
            let error = run_extract(
                &archive,
                &destination,
                &[file("b.txt", "fine.txt"), file("a.txt", path)],
                1024,
            )
            .unwrap_err();
            assert!(
                error.starts_with("unsafeArchiveEntry: "),
                "{path:?}: {error}"
            );
            assert!(is_empty_dir(&destination), "{path:?}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn extract_never_writes_through_a_symlinked_folder() {
        let dir = tempfile::tempdir().unwrap();
        let archive = write_archive(dir.path(), &stored_zip(&[("a.txt", b"a"), ("b.txt", b"b")]));
        let outside = dir.path().join("outside");
        let destination = dir.path().join("out");
        fs::create_dir(&outside).unwrap();
        fs::create_dir(&destination).unwrap();
        std::os::unix::fs::symlink(&outside, destination.join("link")).unwrap();
        let error = run_extract(
            &archive,
            &destination,
            &[file("b.txt", "first.txt"), file("a.txt", "link/a.txt")],
            1024,
        )
        .unwrap_err();
        assert!(error.starts_with("unsafeArchiveEntry: "), "{error}");
        assert!(is_empty_dir(&outside));
        assert!(!destination.join("first.txt").exists());
        assert!(destination.join("link").is_symlink());
    }

    #[cfg(unix)]
    #[test]
    fn extract_never_writes_through_a_planted_symlink_file() {
        let dir = tempfile::tempdir().unwrap();
        let archive = write_archive(dir.path(), &stored_zip(&[("a.txt", b"new")]));
        let target = dir.path().join("target.txt");
        fs::write(&target, "untouched").unwrap();
        let destination = dir.path().join("out");
        fs::create_dir(&destination).unwrap();
        std::os::unix::fs::symlink(&target, destination.join("a.txt")).unwrap();
        let error =
            run_extract(&archive, &destination, &[file("a.txt", "a.txt")], 1024).unwrap_err();
        assert!(error.starts_with("importFailed: "), "{error}");
        assert_eq!(fs::read(&target).unwrap(), b"untouched");
        assert!(destination.join("a.txt").is_symlink());
    }

    #[test]
    fn extract_fails_on_an_existing_file_and_removes_only_what_it_created() {
        let dir = tempfile::tempdir().unwrap();
        let archive = write_archive(dir.path(), &stored_zip(&[("a.txt", b"a"), ("b.txt", b"b")]));
        let destination = dir.path().join("out");
        fs::create_dir_all(destination.join("files")).unwrap();
        fs::write(destination.join("files/b"), "keep").unwrap();
        let error = run_extract(
            &archive,
            &destination,
            &[file("a.txt", "new/a"), file("b.txt", "files/b")],
            1024,
        )
        .unwrap_err();
        assert!(error.starts_with("importFailed: "), "{error}");
        assert_eq!(fs::read(destination.join("files/b")).unwrap(), b"keep");
        assert!(!destination.join("new").exists());
    }

    #[test]
    fn extract_rejects_a_crc_mismatch_and_cleans_up() {
        let dir = tempfile::tempdir().unwrap();
        let mut bytes = stored_zip(&[("a.txt", b"good"), ("b.txt", b"bad")]);
        patch_central_u32(&mut bytes, CENTRAL_CRC, 0x1234_5678);
        let archive = write_archive(dir.path(), &bytes);
        let destination = dir.path().join("out");
        fs::create_dir(&destination).unwrap();
        let error = run_extract(
            &archive,
            &destination,
            &[file("a.txt", "x/a"), file("b.txt", "x/b")],
            1024,
        )
        .unwrap_err();
        assert!(error.starts_with("invalidArchive: "), "{error}");
        assert!(error.contains("checksum"), "{error}");
        assert!(is_empty_dir(&destination));
    }

    #[test]
    fn extract_rejects_a_declared_size_that_does_not_match_the_data() {
        for declared in [1u32, 10] {
            let dir = tempfile::tempdir().unwrap();
            let mut bytes = stored_zip(&[("a.txt", b"four")]);
            patch_central_u32(&mut bytes, CENTRAL_UNCOMPRESSED_SIZE, declared);
            let archive = write_archive(dir.path(), &bytes);
            let destination = dir.path().join("out");
            fs::create_dir(&destination).unwrap();
            let error =
                run_extract(&archive, &destination, &[file("a.txt", "a.txt")], 1024).unwrap_err();
            assert!(error.starts_with("invalidArchive: "), "{declared}: {error}");
            assert!(error.contains("declares"), "{declared}: {error}");
            assert!(is_empty_dir(&destination));
        }
    }

    #[test]
    fn extract_refuses_declared_sizes_over_max_bytes_before_writing() {
        let dir = tempfile::tempdir().unwrap();
        let data = vec![b'x'; 100];
        let archive = write_archive(
            dir.path(),
            &stored_zip(&[("a.bin", &data), ("b.bin", &data)]),
        );
        let destination = dir.path().join("out");
        fs::create_dir(&destination).unwrap();
        let files = [file("a.bin", "x/a.bin"), file("b.bin", "x/b.bin")];
        assert_eq!(
            run_extract(&archive, &destination, &files, 200)
                .unwrap()
                .bytes,
            200
        );

        // The headers declare 100 bytes each, so 150 is refused up front.
        let second = dir.path().join("second");
        fs::create_dir(&second).unwrap();
        let error = run_extract(&archive, &second, &files, 150).unwrap_err();
        assert!(error.starts_with("archiveTooLarge: "), "{error}");
        assert!(is_empty_dir(&second));
    }

    #[test]
    fn extract_stops_at_max_bytes_when_a_header_understates_the_data() {
        let dir = tempfile::tempdir().unwrap();
        let data = vec![b'x'; 200];
        let mut bytes = stored_zip(&[("a.bin", &data)]);
        patch_central_u32(&mut bytes, CENTRAL_UNCOMPRESSED_SIZE, 4);
        let archive = write_archive(dir.path(), &bytes);
        let destination = dir.path().join("out");
        fs::create_dir(&destination).unwrap();
        let error =
            run_extract(&archive, &destination, &[file("a.bin", "x/a.bin")], 100).unwrap_err();
        assert!(error.starts_with("archiveTooLarge: "), "{error}");
        assert!(is_empty_dir(&destination));
    }

    #[test]
    fn extract_rejects_duplicate_destination_paths_case_insensitively() {
        let dir = tempfile::tempdir().unwrap();
        let archive = write_archive(dir.path(), &stored_zip(&[("a.txt", b"a"), ("b.txt", b"b")]));
        let destination = dir.path().join("out");
        fs::create_dir(&destination).unwrap();
        for second in ["files/ABC", "files/abc"] {
            let error = run_extract(
                &archive,
                &destination,
                &[file("a.txt", "files/abc"), file("b.txt", second)],
                1024,
            )
            .unwrap_err();
            assert!(error.starts_with("invalidArchive: "), "{second}: {error}");
            assert!(is_empty_dir(&destination));
        }
    }

    #[test]
    fn extract_rejects_missing_and_directory_entries() {
        let dir = tempfile::tempdir().unwrap();
        let archive = write_archive(
            dir.path(),
            &stored_zip(&[("Project One/", b""), ("a.txt", b"a")]),
        );
        let destination = dir.path().join("out");
        fs::create_dir(&destination).unwrap();
        for entry in ["missing.txt", "A.TXT", "Project One/"] {
            let error = run_extract(
                &archive,
                &destination,
                &[file("a.txt", "a.txt"), file(entry, "other")],
                1024,
            )
            .unwrap_err();
            assert!(error.starts_with("invalidArchive: "), "{entry}: {error}");
            assert!(is_empty_dir(&destination));
        }
    }

    #[test]
    fn extract_rejects_data_that_is_not_a_zip_and_a_missing_destination() {
        let dir = tempfile::tempdir().unwrap();
        let not_zip = write_archive(dir.path(), b"not a zip at all");
        let error = run_extract(&not_zip, dir.path(), &[], 1024).unwrap_err();
        assert!(error.starts_with("invalidArchive: "), "{error}");
        let archive = write_archive(dir.path(), &stored_zip(&[("a.txt", b"a")]));
        let error = run_extract(
            &archive,
            &dir.path().join("missing"),
            &[file("a.txt", "a.txt")],
            1024,
        )
        .unwrap_err();
        assert!(error.starts_with("importFailed: "), "{error}");
    }
}
