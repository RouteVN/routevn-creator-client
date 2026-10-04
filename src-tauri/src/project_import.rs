//! Native building blocks for project import: stream a download to disk, list a
//! zip and extract chosen entries. Everything else about import (zip layout,
//! names, limits, stages, folder naming) lives in JavaScript; see the
//! "Native contract" section of `docs/project-import.md`.

use std::collections::HashSet;
use std::fmt::Display;
use std::fs::{self, File, OpenOptions};
use std::io::{ErrorKind, Read, Seek, SeekFrom, Write};
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

const MAX_ZIP_COMMENT_BYTES: u64 = 1024;
const MAX_CENTRAL_DIRECTORY_BYTES: u64 = 64 * 1024 * 1024;
const MAX_ENTRY_NAME_BYTES: u64 = 4096;
const MAX_EXTRA_FIELDS_PER_ENTRY: u32 = 16;

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

/// Where the central directory is, read from the records at the end of a zip.
#[derive(Debug, PartialEq)]
struct DirectoryLocation {
    entries: u64,
    start: u64,
    size: u64,
    /// Bytes in front of the zip data, such as a self-extractor stub.
    archive_offset: u64,
    end_record: u64,
}

/// Little-endian field of `width` bytes at `offset`; never panics.
fn le(bytes: &[u8], offset: usize, width: usize) -> u64 {
    bytes
        .iter()
        .skip(offset)
        .take(width)
        .rev()
        .fold(0, |value, byte| value << 8 | u64::from(*byte))
}

/// Reads the end records from `tail`, the last bytes of a `file_len`-byte
/// file. The last end-record signature in the file must be the end record,
/// with its comment ending exactly at the end of the file, and the central
/// directory must sit right in front of it (or in front of the zip64 end
/// record), so no offset in the file is trusted to find it.
fn locate_directory(
    tail: &[u8],
    file_len: u64,
    max_entries: u64,
) -> Result<DirectoryLocation, String> {
    let invalid = |detail: String| err(INVALID_ARCHIVE, detail);
    let eocd_at = tail
        .windows(4)
        .rposition(|window| window == b"PK\x05\x06")
        .ok_or_else(|| invalid("end of central directory record not found".into()))?;
    let eocd = tail.get(eocd_at..).unwrap_or_default();
    let comment_len = le(eocd, 20, 2);
    if eocd.len() < 22 || eocd.len() as u64 != 22 + comment_len {
        return Err(invalid(
            "end of central directory record does not end the file".into(),
        ));
    }
    if comment_len > MAX_ZIP_COMMENT_BYTES {
        return Err(invalid(format!(
            "zip comment is {comment_len} bytes, limit is {MAX_ZIP_COMMENT_BYTES}"
        )));
    }
    let eocd_pos = file_len
        .saturating_sub(tail.len() as u64)
        .saturating_add(eocd_at as u64);
    let (mut entries, mut size, mut offset) = (le(eocd, 10, 2), le(eocd, 12, 4), le(eocd, 16, 4));
    let mut end = eocd_pos;
    let mut zip64_offset = None;
    // Single-disk writers repeat the entry count in entries-on-this-disk,
    // which is the count the zip crate reads from this record.
    if le(eocd, 8, 2) != entries {
        return Err(invalid("multi-disk archives are not supported".into()));
    }
    let has_locator = eocd_at
        .checked_sub(20)
        .and_then(|at| tail.get(at..))
        .is_some_and(|bytes| bytes.starts_with(b"PK\x06\x07"));
    if has_locator || entries == 0xFFFF || size == 0xFFFF_FFFF || offset == 0xFFFF_FFFF {
        // A 56-byte zip64 end record, then the 20-byte locator, then the end record.
        let (record, locator) = eocd_at
            .checked_sub(76)
            .and_then(|at| tail.get(at..eocd_at))
            .filter(|bytes| bytes.starts_with(b"PK\x06\x06") && le(bytes, 4, 8) == 44)
            .map(|bytes| bytes.split_at(56))
            .filter(|(_, locator)| locator.starts_with(b"PK\x06\x07"))
            .ok_or_else(|| invalid("zip64 end of central directory not found".into()))?;
        if le(locator, 4, 4) != 0
            || le(locator, 16, 4) > 1
            || le(record, 16, 4) != 0
            || le(record, 20, 4) != 0
            || le(record, 24, 8) != le(record, 32, 8)
        {
            return Err(invalid("multi-disk archives are not supported".into()));
        }
        let (entries64, size64, offset64) =
            (le(record, 32, 8), le(record, 40, 8), le(record, 48, 8));
        if (entries != 0xFFFF && entries != entries64)
            || (size != 0xFFFF_FFFF && size != size64)
            || (offset != 0xFFFF_FFFF && offset != offset64)
        {
            return Err(invalid("zip64 end records disagree".into()));
        }
        (entries, size, offset) = (entries64, size64, offset64);
        end = eocd_pos.saturating_sub(76);
        // The locator points at the zip64 record relative to the zip data.
        zip64_offset = Some(
            end.checked_sub(le(locator, 8, 8))
                .ok_or_else(|| invalid("zip64 locator points past the zip64 end record".into()))?,
        );
    } else if le(eocd, 4, 2) != 0 || le(eocd, 6, 2) != 0 {
        return Err(invalid("multi-disk archives are not supported".into()));
    }
    if entries > max_entries {
        return Err(invalid(format!(
            "archive has {entries} entries, limit is {max_entries}"
        )));
    }
    if size > MAX_CENTRAL_DIRECTORY_BYTES {
        return Err(invalid(format!(
            "central directory is {size} bytes, limit is {MAX_CENTRAL_DIRECTORY_BYTES}"
        )));
    }
    // Every central directory record takes at least 46 bytes.
    if entries.checked_mul(46).is_none_or(|least| least > size) {
        return Err(invalid(format!(
            "central directory of {size} bytes cannot hold {entries} entries"
        )));
    }
    let start = end
        .checked_sub(size)
        .ok_or_else(|| invalid("central directory does not fit in the file".into()))?;
    let archive_offset = start
        .checked_sub(offset)
        .ok_or_else(|| invalid("central directory offset is past the directory".into()))?;
    if zip64_offset.is_some_and(|zip64_offset| zip64_offset != archive_offset) {
        return Err(invalid("zip64 end records disagree".into()));
    }
    Ok(DirectoryLocation {
        entries,
        start,
        size,
        archive_offset,
        end_record: eocd_pos,
    })
}

/// The file as the zip crate sees it during the check: the bytes from the
/// central directory to the end, with zeros in front of them. A read that lies
/// entirely in front fails, and so does, once the crate has read the end
/// record, a read that starts at another end-record signature. If the crate
/// gives up on the checked directory, its search for another end record
/// therefore skips each candidate at once and stops at the directory start.
struct DirectoryView {
    start: u64,
    end_record: u64,
    end_record_read: bool,
    bytes: Vec<u8>,
    pos: u64,
}

impl Read for DirectoryView {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if self.pos < self.start {
            let hidden = self.start - self.pos;
            if hidden >= buf.len() as u64 {
                return Err(std::io::Error::other("read before the central directory"));
            }
            buf[..hidden as usize].fill(0);
            self.pos = self.start;
            return Ok(hidden as usize);
        }
        let offset = usize::try_from(self.pos - self.start).unwrap_or(usize::MAX);
        let rest = self.bytes.get(offset..).unwrap_or_default();
        if self.pos == self.end_record {
            self.end_record_read = true;
        } else if self.end_record_read && rest.starts_with(b"PK\x05\x06") {
            return Err(std::io::Error::other("read at another end record"));
        }
        let count = rest.len().min(buf.len());
        buf[..count].copy_from_slice(&rest[..count]);
        self.pos += count as u64;
        Ok(count)
    }
}

impl Seek for DirectoryView {
    fn seek(&mut self, from: SeekFrom) -> std::io::Result<u64> {
        let len = self.start + self.bytes.len() as u64;
        let pos = match from {
            SeekFrom::Start(pos) => Some(pos),
            SeekFrom::End(delta) => len.checked_add_signed(delta),
            SeekFrom::Current(delta) => self.pos.checked_add_signed(delta),
        };
        self.pos = pos.ok_or_else(|| std::io::Error::new(ErrorKind::InvalidInput, "bad seek"))?;
        Ok(self.pos)
    }
}

/// Checks a zip cheaply before the zip crate opens it. The crate retries every
/// end-record signature it finds, scanning backwards over the whole file, and
/// loads every directory record before the entry count can be checked, so a
/// small crafted file could keep it busy for hours or make it allocate
/// gigabytes. This accepts one exact end record and at most `max_entries`
/// entries in a bounded directory right in front of it. The crate then parses
/// that directory through a `DirectoryView`, so a record it rejects cannot send
/// it searching through the rest of the file. The returned config pins the
/// directory position, and the real open makes the same reads as that parse,
/// so it succeeds on the first end record.
fn check_archive_layout(file: &mut File, max_entries: u64) -> Result<zip::read::Config, String> {
    let read_failed =
        |error: std::io::Error| err(IMPORT_FAILED, format!("cannot read archive: {error}"));
    let file_len = file.metadata().map_err(read_failed)?.len();
    let mut tail = vec![0; file_len.min(22 + 0xFFFF) as usize];
    file.seek(SeekFrom::Start(file_len - tail.len() as u64))
        .and_then(|_| file.read_exact(&mut tail))
        .map_err(read_failed)?;
    let location = locate_directory(&tail, file_len, max_entries)?;

    let mut bytes = vec![0; file_len.saturating_sub(location.start) as usize];
    file.seek(SeekFrom::Start(location.start))
        .and_then(|_| file.read_exact(&mut bytes))
        .map_err(read_failed)?;
    let mut at = 0u64;
    for index in 0..location.entries {
        let record = bytes
            .get(at as usize..)
            .and_then(|rest| rest.get(..46))
            .filter(|record| record.starts_with(b"PK\x01\x02") && at + 46 <= location.size)
            .ok_or_else(|| {
                err(
                    INVALID_ARCHIVE,
                    format!("central directory record {index} is malformed"),
                )
            })?;
        let (name_len, extra_len) = (le(record, 28, 2), le(record, 30, 2));
        if name_len > MAX_ENTRY_NAME_BYTES {
            return Err(err(
                INVALID_ARCHIVE,
                format!("entry name is {name_len} bytes, limit is {MAX_ENTRY_NAME_BYTES}"),
            ));
        }
        // The zip crate keeps a 32-byte entry for every tiny timestamp field
        // and copies the whole extra data for every zip64 field it strips, so
        // thousands of small fields cost memory or quadratic time.
        let extra = bytes
            .get((at + 46 + name_len) as usize..)
            .and_then(|rest| rest.get(..extra_len as usize))
            .unwrap_or_default();
        let (mut field, mut fields, mut zip64_fields) = (0, 0, 0);
        while let Some(header) = extra.get(field..field + 4) {
            fields += 1;
            zip64_fields += u32::from(le(header, 0, 2) == 1);
            field += 4 + le(header, 2, 2) as usize;
        }
        if fields > MAX_EXTRA_FIELDS_PER_ENTRY || zip64_fields > 1 {
            return Err(err(
                INVALID_ARCHIVE,
                format!(
                    "central directory record {index} has {fields} extra fields, \
                     {zip64_fields} of them zip64"
                ),
            ));
        }
        at += 46 + name_len + extra_len + le(record, 32, 2);
    }
    if at != location.size {
        return Err(err(
            INVALID_ARCHIVE,
            "central directory size does not match its records",
        ));
    }

    let config = zip::read::Config {
        archive_offset: zip::read::ArchiveOffset::Known(location.archive_offset),
    };
    let view = DirectoryView {
        start: location.start,
        end_record: location.end_record,
        end_record_read: false,
        bytes,
        pos: 0,
    };
    zip::ZipArchive::with_config(config, view).map_err(|error| match error {
        // The view only fails a read once the crate gave up on this directory.
        zip::result::ZipError::Io(_) => {
            err(INVALID_ARCHIVE, "zip reader rejected the central directory")
        }
        error => err(INVALID_ARCHIVE, error),
    })?;
    Ok(config)
}

/// `max_entries` is checked before the central directory is read.
fn open_archive(archive: &Path, max_entries: u64) -> Result<zip::ZipArchive<File>, String> {
    let mut file = File::open(archive).map_err(|error| {
        err(
            IMPORT_FAILED,
            format!("cannot open {}: {error}", archive.display()),
        )
    })?;
    let config = check_archive_layout(&mut file, max_entries)?;
    zip::ZipArchive::with_config(config, file).map_err(|error| err(INVALID_ARCHIVE, error))
}

fn list(archive_path: &Path, max_entries: u64) -> Result<ArchiveListing, String> {
    let mut archive = open_archive(archive_path, max_entries)?;
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
    // extract_archive takes no entry limit: JavaScript lists the same archive
    // with its limit first, and the directory size cap bounds the rest.
    let mut archive = open_archive(archive_path, u64::MAX)?;
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
    use serde_json::json;
    use std::io::Cursor;
    use std::sync::{Arc, Mutex};
    use zip::CompressionMethod::{Deflated, Stored};

    type Events = Arc<Mutex<Vec<(u64, u64)>>>;

    /// A sink that records `(current, total)` for every event.
    fn recording() -> (ProgressSink, Events) {
        let events = Events::default();
        let received = Arc::clone(&events);
        let sink = ProgressSink::new(move |event| {
            received.lock().unwrap().push((event.current, event.total));
        });
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

    fn response(head: &str, body: &str) -> String {
        format!("HTTP/1.1 {head}\r\nConnection: close\r\n\r\n{body}")
    }

    fn ok_response(body: &str) -> String {
        response(&format!("200 OK\r\nContent-Length: {}", body.len()), body)
    }

    fn redirect_to(location: &str) -> String {
        response(
            &format!("302 Found\r\nLocation: {location}\r\nContent-Length: 0"),
            "",
        )
    }

    fn run_download(
        url: &str,
        destination: &Path,
        max_bytes: u64,
    ) -> (Result<DownloadResult, String>, Vec<(u64, u64)>) {
        let (mut sink, events) = recording();
        let result =
            tauri::async_runtime::block_on(download(url, destination, max_bytes, &mut sink));
        let events = events.lock().unwrap().clone();
        (result, events)
    }

    #[test]
    fn download_follows_five_redirects_and_returns_the_body_and_headers() {
        let body = "Project One archive ".repeat(10);
        let disposition =
            "attachment; filename*=UTF-8''Project%20One.zip; filename=\"Project One.zip\"";
        let mut responses = vec![redirect_to("/archive.zip"); 4];
        responses.push(redirect_to("/next.zip"));
        let head = format!("200 OK\r\nContent-Disposition: {disposition}");
        responses.push(response(&format!("{head}\r\nContent-Length: 200"), &body));
        let url = spawn_server(responses);
        let dir = tempfile::tempdir().unwrap();
        let destination = dir.path().join("download.zip");
        let (result, events) = run_download(url.as_str(), &destination, 1024);
        let json = serde_json::to_value(result.unwrap()).unwrap();
        assert_eq!(fs::read(&destination).unwrap(), body.as_bytes());
        assert_eq!(json["bytes"], 200);
        assert_eq!(json["finalUrl"], url.join("/next.zip").unwrap().as_str());
        assert_eq!(json["contentDisposition"], disposition);
        // The first event follows the response headers; the last ends the body.
        assert_eq!(events.first(), Some(&(0, 200)));
        assert_eq!(events.last(), Some(&(200, 200)));
    }

    #[test]
    fn download_failures_leave_no_file_and_send_no_progress() {
        let not_found = spawn_server(vec![response("404 Not Found\r\nContent-Length: 0", "")]);
        let insecure_hop = spawn_server(vec![redirect_to("http://example.com/a.zip")]);
        // Five redirects are followed; the sixth is one too many.
        let redirect_loop = spawn_server(vec![redirect_to("/archive.zip"); 6]);
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let refused = format!("http://{}/a.zip", listener.local_addr().unwrap());
        drop(listener);
        let dir = tempfile::tempdir().unwrap();
        let destination = dir.path().join("a.zip");
        for (url, expected) in [
            ("https://user:secret@example.com/a.zip", "invalidUrl: "),
            ("https://user@example.com/a.zip", "invalidUrl: "),
            ("http://example.com/a.zip", "invalidUrl: "),
            ("ftp://127.0.0.1/a.zip", "invalidUrl: "),
            ("not a url", "invalidUrl: "),
            // Every redirect hop passes the same check.
            (insecure_hop.as_str(), "invalidUrl: "),
            (not_found.as_str(), "downloadFailed: HTTP 404"),
            (redirect_loop.as_str(), "downloadFailed: too many redirects"),
            (refused.as_str(), "downloadFailed: "),
        ] {
            let (result, events) = run_download(url, &destination, 1024);
            let error = result.unwrap_err();
            assert!(error.starts_with(expected), "{url}: {error}");
            assert!(!destination.exists(), "{url}");
            assert!(events.is_empty(), "{url}: {events:?}");
        }
    }

    #[test]
    fn download_enforces_max_bytes_and_never_overwrites_a_file() {
        let body = "x".repeat(4096);
        let dir = tempfile::tempdir().unwrap();
        let destination = dir.path().join("a.zip");
        // The declared length is too large, or (without one) the streamed bytes are.
        for response in [ok_response(&body), response("200 OK", &body)] {
            let url = spawn_server(vec![response]);
            let error = run_download(url.as_str(), &destination, 4095).0;
            assert!(error.unwrap_err().starts_with("archiveTooLarge: "));
            assert!(!destination.exists());
        }
        let url = spawn_server(vec![ok_response(&body)]);
        let result = run_download(url.as_str(), &destination, 4096).0.unwrap();
        let json = serde_json::to_value(result).unwrap();
        assert_eq!(json, json!({ "finalUrl": url.as_str(), "bytes": 4096 }));
        // The destination is claimed before connecting, so no server is needed.
        let error = run_download("https://example.com/a.zip", &destination, 4096).0;
        assert!(error.unwrap_err().starts_with("importFailed: "));
        assert_eq!(fs::read(&destination).unwrap(), body.as_bytes());
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

    /// Writes `zip` to a new temporary folder next to an empty `out` folder.
    fn setup(zip: &[u8]) -> (tempfile::TempDir, PathBuf, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let archive = dir.path().join("archive.zip");
        fs::write(&archive, zip).unwrap();
        let out = dir.path().join("out");
        fs::create_dir(&out).unwrap();
        (dir, archive, out)
    }

    fn requests(files: &[(&str, &str)]) -> Vec<ExtractFile> {
        let request = |&(entry, path): &(&str, &str)| ExtractFile {
            entry: entry.into(),
            path: path.into(),
        };
        files.iter().map(request).collect()
    }

    fn run_extract(
        archive: &Path,
        out: &Path,
        files: &[(&str, &str)],
        max_bytes: u64,
    ) -> Result<ExtractResult, String> {
        let mut quiet = ProgressSink::new(|_| {});
        extract(archive, out, &requests(files), max_bytes, &mut quiet)
    }

    fn is_empty_dir(path: &Path) -> bool {
        fs::read_dir(path).unwrap().next().is_none()
    }

    // ----- list_archive and the archive layout check -----

    #[test]
    fn list_returns_raw_entry_names_sizes_and_directories() {
        let names = ["One/", "One/db", "../up", "/abs", "a\\b"];
        let entries: Vec<(&str, &[u8])> = names.iter().map(|name| (*name, &b"12345"[..])).collect();
        let (dir, archive, _) = setup(&zip_bytes(&entries, Stored));
        let json = serde_json::to_value(list(&archive, 100).unwrap()).unwrap();
        let listed: Vec<_> = (0..5).map(|i| &json["entries"][i]["name"]).collect();
        assert_eq!(listed, names);
        let directory = json!({ "name": "One/", "size": 0, "isDirectory": true });
        assert_eq!(json["entries"][0], directory);
        let file = json!({ "name": "One/db", "size": 5, "isDirectory": false });
        assert_eq!(json["entries"][1], file);
        let error = list(&dir.path().join("missing.zip"), 10).unwrap_err();
        assert!(error.starts_with("importFailed: "), "{error}");
    }

    fn end_record(entries: u16, size: u32, offset: u32, comment: &[u8]) -> Vec<u8> {
        let mut record = b"PK\x05\x06\0\0\0\0".to_vec();
        record.extend_from_slice(&entries.to_le_bytes());
        record.extend_from_slice(&entries.to_le_bytes());
        record.extend_from_slice(&size.to_le_bytes());
        record.extend_from_slice(&offset.to_le_bytes());
        record.extend_from_slice(&(comment.len() as u16).to_le_bytes());
        record.extend_from_slice(comment);
        record
    }

    // A directory record for an empty stored entry whose local header would be
    // at offset 0. Opening an archive never reads local headers.
    fn central_record(name: impl AsRef<[u8]>) -> Vec<u8> {
        let name = name.as_ref();
        let mut record = b"PK\x01\x02\x14\0\x14\0".to_vec();
        record.extend_from_slice(&[0; 20]);
        record.extend_from_slice(&(name.len() as u16).to_le_bytes());
        record.extend_from_slice(&[0; 16]);
        record.extend_from_slice(name);
        record
    }

    fn central_records(count: usize) -> Vec<u8> {
        (0..count)
            .flat_map(|index| central_record(format!("{index:05}")))
            .collect()
    }

    // A record the zip crate refuses: AES compression without the AES extra field.
    fn refused_record() -> Vec<u8> {
        let mut record = central_record("Project One/project.db");
        record[10] = 99;
        record
    }

    // `count` records that each carry `extra`, then their end record.
    fn with_extra(extra: &[u8], count: u16) -> Vec<u8> {
        let mut record = central_record("Project One/project.db");
        record[30..32].copy_from_slice(&(extra.len() as u16).to_le_bytes());
        record.extend_from_slice(extra);
        let directory = record.repeat(count.into());
        let end = end_record(count, directory.len() as u32, 0, b"");
        [directory, end].concat()
    }

    // An empty timestamp field and an empty zip64 field.
    const TIMESTAMP_FIELD: [u8; 5] = [0x55, 0x54, 1, 0, 0];
    const ZIP64_FIELD: [u8; 4] = [1, 0, 0, 0];

    // A zip64 end record, its locator and an end record full of markers.
    fn zip64_end(entries: u64, size: u64, offset: u64, record_offset: u64) -> Vec<u8> {
        let mut bytes = b"PK\x06\x06".to_vec();
        bytes.extend_from_slice(&44u64.to_le_bytes());
        bytes.extend_from_slice(&[45, 0, 45, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        for value in [entries, entries, size, offset] {
            bytes.extend_from_slice(&value.to_le_bytes());
        }
        bytes.extend_from_slice(b"PK\x06\x07\0\0\0\0");
        bytes.extend_from_slice(&record_offset.to_le_bytes());
        bytes.extend_from_slice(&1u32.to_le_bytes());
        bytes.extend(end_record(u16::MAX, u32::MAX, u32::MAX, b""));
        bytes
    }

    // Puts `stub` in front of a zip written without a comment and gives it
    // `comment`. `zip64` adds zip64 end records, with markers in the 32-bit
    // end record (`Some(true)`) or with its real values (`Some(false)`).
    fn rewrite_end(zip: &[u8], stub: &[u8], comment: &[u8], zip64: Option<bool>) -> Vec<u8> {
        let (body, eocd) = zip.split_at(zip.len() - 22);
        let (entries, size, offset) = (le(eocd, 10, 2), le(eocd, 12, 4), le(eocd, 16, 4));
        let mut bytes = [stub, body].concat();
        if let Some(markers) = zip64 {
            let zip64 = zip64_end(entries, size, offset, body.len() as u64);
            bytes.extend_from_slice(&zip64[..zip64.len() - 22]);
            if markers {
                bytes.extend(end_record(u16::MAX, u32::MAX, u32::MAX, comment));
                return bytes;
            }
        }
        let end = end_record(entries as u16, size as u32, offset as u32, comment);
        [bytes, end].concat()
    }

    // Security regressions: before the layout check, the zip crate spent tens
    // of seconds (or gigabytes) on small crafted files like these.
    #[test]
    fn hostile_archive_layouts_are_rejected_quickly() {
        let directory = central_records(2000);
        let size = directory.len() as u32;
        // Each fake claims one entry more than the directory holds.
        let fake = end_record(2001, size, 0, b"");
        let fakes_in_comment = [&directory[..], &end_record(2000, size, 0, &fake.repeat(46))];
        let fakes_after_end = [
            &directory[..],
            &end_record(2000, size, 0, b""),
            &fake.repeat(2000),
        ];
        // Entry data holding a run of directory records and many end records
        // that point at it, then a directory whose only record the zip crate
        // refuses. On a refusal the crate alone tries every planted end record.
        let mut in_data = central_records(3000);
        in_data.extend(end_record(3001, in_data.len() as u32, 0, b"").repeat(3000));
        let start = in_data.len() as u32;
        in_data.extend(refused_record());
        in_data.extend(end_record(1, refused_record().len() as u32, start, b""));
        // A run of records, a refused one, then names full of end records that
        // claim them. On a refusal the crate alone reads the run for each one.
        let mut in_directory = [central_records(2000), refused_record()].concat();
        let claim = end_record(2001, 0, 0, b"").repeat(186);
        in_directory.extend((0..11).flat_map(|_| central_record(&claim)));
        in_directory.extend(end_record(2012, in_directory.len() as u32, 0, b""));
        // Only an end record: the entry count is checked before any directory.
        let count = end_record(60_000, 60_000 * 46, 0, b"");
        // The zip crate alone tries every one of these in turn.
        let end_records = end_record(1, 46, 0, b"").repeat(95_325);
        let one_entry = zip_bytes(&[("a", b"a")], Stored);
        let trailing = [&one_entry[..], b"junk"].concat();
        let comment = rewrite_end(&one_entry, b"", &[b'c'; 1025], None);
        let name = zip_bytes(&[(&"a".repeat(4097), b"a")], Stored);
        let huge = end_record(1, (64 << 20) + 1, 0, b"");
        // The zip crate copies the extra data once per zip64 field it strips
        // and keeps 32 bytes per timestamp field.
        let zip64_fields = with_extra(&ZIP64_FIELD.repeat(16383), 20);
        let timestamps = with_extra(&TIMESTAMP_FIELD.repeat(13107), 20);
        let two_zip64_fields = with_extra(&ZIP64_FIELD.repeat(2), 1);
        let refused = "rejected the central directory";
        for (case, bytes, detail) in [
            ("not a zip", b"just some text".to_vec(), "record not found"),
            ("count", count, "archive has 60000 entries, limit is 50000"),
            ("end records", end_records, ""),
            ("fakes in the comment", fakes_in_comment.concat(), ""),
            ("fakes after the end", fakes_after_end.concat(), ""),
            ("trailing data", trailing, "does not end the file"),
            ("comment", comment, "zip comment is 1025 bytes"),
            ("name", name, "entry name is 4097 bytes"),
            ("size", huge, "central directory is 67108865 bytes"),
            ("zip64 fields", zip64_fields, "16383 of them zip64"),
            ("timestamps", timestamps, "13107 extra fields, 0 of"),
            ("two zip64 fields", two_zip64_fields, "2 of them zip64"),
            ("planted in entry data", in_data, refused),
            ("planted in the directory", in_directory, refused),
        ] {
            let (_dir, archive, out) = setup(&bytes);
            let started = Instant::now();
            // Both commands open an archive through the same check.
            let error = list(&archive, 50_000).unwrap_err();
            let extract_error = run_extract(&archive, &out, &[], 1024).unwrap_err();
            let elapsed = started.elapsed();
            assert!(error.starts_with("invalidArchive: "), "{case}: {error}");
            assert!(error.contains(detail), "{case}: {error}");
            assert!(extract_error.starts_with("invalidArchive: "), "{case}");
            assert!(elapsed < Duration::from_secs(2), "{case}: took {elapsed:?}");
        }
    }

    #[test]
    fn valid_archives_still_open() {
        let entries: [(&str, &[u8]); 3] = [
            ("One/", b""),
            ("One/db", b"database"),
            ("One/files/abc", b"picture"),
        ];
        let zip = zip_bytes(&entries, Deflated);
        let files = [("One/db", "db"), ("One/files/abc", "files/abc")];
        let stub = b"#!/bin/sh\necho Project One\n".repeat(40);
        let comment = b"Project One export";
        for (stub, comment, zip64) in [
            (&b""[..], &b""[..], None),
            (&stub[..], &comment[..], None),
            (&b""[..], &[b'c'; 1024][..], None),
            (&b""[..], &b""[..], Some(true)),
            (&stub[..], &comment[..], Some(true)),
            (&stub[..], &b""[..], Some(false)),
        ] {
            let (_dir, archive, out) = setup(&rewrite_end(&zip, stub, comment, zip64));
            let listing = list(&archive, 3).unwrap();
            let names = listing.entries.iter().map(|entry| entry.name.as_str());
            assert!(names.eq(entries.iter().map(|(name, _)| *name)));
            assert_eq!(run_extract(&archive, &out, &files, 1024).unwrap().bytes, 15);
            assert_eq!(fs::read(out.join("files/abc")).unwrap(), b"picture");
        }

        // The CRC-32 of these four bytes is the end-record signature.
        let payload = [0x93, 0x4f, 0xb0, 0x9e];
        let signatures = zip_bytes(
            &[("a", &payload), ("Project One/PK\x05\x06.txt", b"a")],
            Stored,
        );
        // An entry comment that makes the zip crate's first 2,048-byte search
        // window start right at that CRC.
        let one = zip_bytes(&[("a", &payload)], Stored);
        let start = one.len() - 22 - 47;
        let mut window = one[..one.len() - 22].to_vec();
        window[start + 32..start + 34].copy_from_slice(&1995u16.to_le_bytes());
        window.extend([b'c'; 1995]);
        window.extend(end_record(1, 47 + 1995, start as u32, b""));
        assert_eq!(&window[window.len() - 2048..][..4], b"PK\x05\x06");
        let long_name = zip_bytes(&[(&"a".repeat(4096), b"a")], Stored);
        let empty = zip_bytes(&[], Stored);
        for (bytes, count) in [(signatures, 2), (window, 1), (long_name, 1), (empty, 0)] {
            let (_dir, archive, _) = setup(&bytes);
            assert_eq!(list(&archive, count).unwrap().entries.len() as u64, count);
        }

        // Hand-built directories at the limits pass the check.
        let directory = central_records(2000);
        let end = end_record(2000, directory.len() as u32, 0, b"");
        let extra = [TIMESTAMP_FIELD.repeat(15), ZIP64_FIELD.to_vec()].concat();
        for bytes in [[directory, end].concat(), with_extra(&extra, 1)] {
            let (_dir, archive, _) = setup(&bytes);
            assert!(check_archive_layout(&mut File::open(archive).unwrap(), 50_000).is_ok());
        }
    }

    #[test]
    fn locate_directory_reads_a_consistent_zip64_end_and_rejects_an_inconsistent_one() {
        // A 10-byte stub, 100 bytes of entry data and a 46-byte directory
        // before the zip64 end record, so the directory is at 110.
        let build = |entries: u64, offset: u64, record_offset: u64| {
            [vec![0; 156], zip64_end(entries, 46, offset, record_offset)].concat()
        };
        let patched = |at: usize, value: u8| {
            let mut bytes = build(1, 100, 146);
            bytes[at] = value;
            bytes
        };
        let locate = |bytes: &[u8]| locate_directory(bytes, bytes.len() as u64, 10);
        let expected = DirectoryLocation {
            entries: 1,
            start: 110,
            size: 46,
            archive_offset: 10,
            end_record: 232,
        };
        assert_eq!(locate(&build(1, 100, 146)), Ok(expected));
        for (bytes, reason) in [
            (build(1, 100, 145), "zip64 end records disagree"),
            (build(1, 100, 157), "locator points past"),
            (build(2, 100, 146), "cannot hold 2 entries"),
            (patched(172, 1), "multi-disk"),
            // A 32-bit field that is not a marker must match the zip64 one.
            (patched(244, 2), "zip64 end records disagree"),
            (
                end_record(u16::MAX, u32::MAX, u32::MAX, b""),
                "zip64 end of central",
            ),
        ] {
            let error = locate(&bytes).unwrap_err();
            assert!(error.starts_with("invalidArchive: "), "{reason}: {error}");
            assert!(error.contains(reason), "{reason}: {error}");
        }
    }

    // ----- extract_archive -----

    #[test]
    fn extract_writes_only_the_requested_entries_to_the_requested_paths() {
        let entries: [(&str, &[u8]); 5] = [
            ("Project One/", b""),
            ("Project One/project.db", b"database"),
            ("Project One/files/abc.png", b"picture"),
            ("Project One/notes.txt", b"not requested"),
            ("__MACOSX/Project One/._project.db", b"junk"),
        ];
        let (_dir, archive, out) = setup(&zip_bytes(&entries, Deflated));
        let files = requests(&[
            ("Project One/project.db", "project.db"),
            ("Project One/files/abc.png", "files/abc"),
        ]);
        let (mut sink, events) = recording();
        let result = extract(&archive, &out, &files, 1024, &mut sink).unwrap();
        assert_eq!((result.files, result.bytes), (2, 15));
        assert_eq!(fs::read(out.join("project.db")).unwrap(), b"database");
        assert_eq!(fs::read(out.join("files/abc")).unwrap(), b"picture");
        // Nothing else: only project.db and files/ at the top, only abc inside.
        assert_eq!(fs::read_dir(&out).unwrap().count(), 2);
        assert_eq!(fs::read_dir(out.join("files")).unwrap().count(), 1);
        let events = events.lock().unwrap();
        assert_eq!(events.first(), Some(&(0, 15)));
        assert_eq!(events.last(), Some(&(15, 15)));
    }

    #[test]
    fn extract_checks_the_whole_request_before_writing() {
        let entries: [(&str, &[u8]); 3] = [("Project One/", b""), ("a.txt", b"a"), ("b.txt", b"b")];
        let (_dir, archive, out) = setup(&zip_bytes(&entries, Stored));
        let unsafe_entry = "unsafeArchiveEntry: ";
        for (entry, path, expected) in [
            ("a.txt", "", unsafe_entry),
            ("a.txt", "/abs.txt", unsafe_entry),
            ("a.txt", "a//b.txt", unsafe_entry),
            ("a.txt", "dir/./a.txt", unsafe_entry),
            ("a.txt", "dir/../a.txt", unsafe_entry),
            ("a.txt", "dir\\a.txt", unsafe_entry),
            ("a.txt", "C:a.txt", unsafe_entry),
            ("a.txt", "a\0b.txt", unsafe_entry),
            // Destinations are compared case-insensitively.
            ("a.txt", "FILES/First.txt", "invalidArchive: "),
            ("missing.txt", "other", "invalidArchive: "),
            ("Project One/", "other", "invalidArchive: "),
        ] {
            let files = [("b.txt", "files/first.txt"), (entry, path)];
            let error = run_extract(&archive, &out, &files, 1024).unwrap_err();
            assert!(error.starts_with(expected), "{entry:?} {path:?}: {error}");
            assert!(is_empty_dir(&out), "{entry:?} {path:?}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn extract_never_writes_through_a_planted_symlink() {
        let (dir, archive, out) = setup(&zip_bytes(&[("a", b"new"), ("b", b"b")], Stored));
        let (outside, target) = (dir.path().join("outside"), dir.path().join("target"));
        fs::create_dir(&outside).unwrap();
        fs::write(&target, "untouched").unwrap();
        std::os::unix::fs::symlink(&outside, out.join("folder")).unwrap();
        std::os::unix::fs::symlink(&target, out.join("a")).unwrap();
        for (path, expected) in [
            ("folder/a", "unsafeArchiveEntry: "),
            ("a", "importFailed: "),
        ] {
            let error = run_extract(&archive, &out, &[("b", "first"), ("a", path)], 1024);
            assert!(error.unwrap_err().starts_with(expected), "{path}");
            assert!(!out.join("first").exists(), "{path}");
        }
        assert!(is_empty_dir(&outside));
        assert_eq!(fs::read(&target).unwrap(), b"untouched");
        assert!(out.join("folder").is_symlink() && out.join("a").is_symlink());
    }

    #[test]
    fn extract_fails_on_an_existing_file_and_removes_only_what_it_created() {
        let (_dir, archive, out) = setup(&zip_bytes(&[("a", b"a"), ("b", b"b")], Stored));
        fs::create_dir(out.join("files")).unwrap();
        fs::write(out.join("files/b"), "keep").unwrap();
        let error = run_extract(&archive, &out, &[("a", "new/a"), ("b", "files/b")], 1024);
        assert!(error.unwrap_err().starts_with("importFailed: "));
        assert_eq!(fs::read(out.join("files/b")).unwrap(), b"keep");
        assert!(!out.join("new").exists());
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

    #[test]
    fn extract_rejects_a_crc_or_size_mismatch_and_removes_what_it_wrote() {
        for method in [Stored, Deflated] {
            for (field, value, detail) in [
                (CENTRAL_CRC, 0x1234_5678, "checksum"),
                (CENTRAL_UNCOMPRESSED_SIZE, 1, "declares 1 bytes"),
                (CENTRAL_UNCOMPRESSED_SIZE, 10, "declares 10 bytes"),
            ] {
                let mut bytes = zip_bytes(&[("a", b"good"), ("b", b"four")], method);
                patch_central_u32(&mut bytes, field, value);
                let (_dir, archive, out) = setup(&bytes);
                // a is written before b fails; neither it nor x/ is left.
                let error = run_extract(&archive, &out, &[("a", "x/a"), ("b", "x/b")], 1024);
                let error = error.unwrap_err();
                assert!(error.starts_with("invalidArchive: "), "{method:?}: {error}");
                assert!(error.contains(detail), "{method:?}: {error}");
                assert!(is_empty_dir(&out), "{method:?}: {detail}");
            }
        }
    }

    #[test]
    fn extract_counts_declared_and_written_bytes_against_max_bytes() {
        let zip = zip_bytes(&[("a", &[b'x'; 100]), ("b", &[b'x'; 100])], Stored);
        // A header that understates its data does not raise the limit.
        let mut understated = zip.clone();
        patch_central_u32(&mut understated, CENTRAL_UNCOMPRESSED_SIZE, 4);
        let files = [("a", "x/a"), ("b", "x/b")];
        for (bytes, max_bytes) in [(&zip, 199), (&understated, 150)] {
            let (_dir, archive, out) = setup(bytes);
            let error = run_extract(&archive, &out, &files, max_bytes).unwrap_err();
            assert!(error.starts_with("archiveTooLarge: "), "{error}");
            assert!(is_empty_dir(&out), "{max_bytes}");
        }
        let (_dir, archive, out) = setup(&zip);
        assert_eq!(run_extract(&archive, &out, &files, 200).unwrap().bytes, 200);
    }
}
