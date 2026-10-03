//! Desktop project import. Entry paths with a leading `./` are intentionally
//! rejected, including archives produced with those arcnames by Python zipfile.

use std::collections::HashMap;
use std::fmt::Display;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde::Serialize;
use tokio::io::AsyncWriteExt;
use url::Url;

const INVALID_URL: &str = "invalidUrl";
const DOWNLOAD_FAILED: &str = "downloadFailed";
const ARCHIVE_TOO_LARGE: &str = "archiveTooLarge";
const INVALID_ARCHIVE: &str = "invalidArchive";
const UNSAFE_ARCHIVE_ENTRY: &str = "unsafeArchiveEntry";
const INVALID_FILE_NAME: &str = "invalidFileName";
const FILE_NAME_CONFLICT: &str = "fileNameConflict";
const IMPORT_FAILED: &str = "importFailed";

const DEFAULT_FOLDER_NAME: &str = "RouteVN Project";
const MAX_FILE_ID_LEN: usize = 128;
const EXPORT_INCOMPLETE_MARKER: &str = "export-incomplete";
const MAX_CENTRAL_DIRECTORY_BYTES: u64 = 64 * 1024 * 1024;
// The EOCD signature is searched backwards within the last 64 KiB plus the
// 22-byte record itself (the maximum zip comment is 64 KiB).
const EOCD_SEARCH_TAIL_BYTES: usize = 64 * 1024 + 22;
const EOCD_RECORD_LEN: usize = 22;
const ZIP64_EOCD_RECORD_LEN: usize = 56;
const ZIP64_LOCATOR_LEN: usize = 20;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgress {
    pub stage: String,
    pub current: u64,
    pub total: u64,
}

pub struct ProgressSink {
    send: Option<Box<dyn Fn(ImportProgress) + Send + Sync>>,
    stage: &'static str,
    last_sent: Option<Instant>,
}

impl ProgressSink {
    fn new(send: Option<Box<dyn Fn(ImportProgress) + Send + Sync>>) -> Self {
        Self {
            send,
            stage: "",
            last_sent: None,
        }
    }

    fn begin(&mut self, stage: &'static str, total: u64) {
        self.stage = stage;
        self.last_sent = None;
        self.emit(0, total);
    }

    fn report(&mut self, current: u64, total: u64) {
        if self
            .last_sent
            .is_none_or(|last| last.elapsed() >= Duration::from_millis(100))
        {
            self.emit(current, total);
        }
    }

    fn end(&mut self, current: u64, total: u64) {
        self.emit(current, total);
    }

    fn emit(&mut self, current: u64, total: u64) {
        if let Some(send) = &self.send {
            send(ImportProgress {
                stage: self.stage.to_string(),
                current,
                total,
            });
        }
        self.last_sent = Some(Instant::now());
    }
}

fn err(code: &str, detail: impl Display) -> String {
    format!("{code}: {detail}")
}

// Limits are shared across platforms (Rust, Android, iOS) and must stay in sync.
#[derive(Clone)]
pub struct ImportLimits {
    pub max_entries: usize,
    pub max_total_uncompressed: u64,
    pub max_archive_bytes: u64,
    pub max_redirects: u32,
}

impl Default for ImportLimits {
    fn default() -> Self {
        Self {
            max_entries: 50_000,
            max_total_uncompressed: 8 * 1024 * 1024 * 1024,
            max_archive_bytes: 4 * 1024 * 1024 * 1024,
            max_redirects: 5,
        }
    }
}

// ---------- Rule C: URL validation and download ----------

fn is_loopback_host(url: &Url) -> bool {
    matches!(
        url.host(),
        Some(url::Host::Domain("localhost"))
            | Some(url::Host::Ipv4(std::net::Ipv4Addr::LOCALHOST))
            | Some(url::Host::Ipv6(std::net::Ipv6Addr::LOCALHOST))
    )
}

pub fn validate_import_url(url: &Url) -> Result<(), String> {
    if !url.username().is_empty() || url.password().is_some() {
        return Err(err(INVALID_URL, "credentials in URL are not allowed"));
    }
    let scheme = url.scheme();
    if scheme == "https" {
        return Ok(());
    }
    if scheme == "http" && is_loopback_host(url) {
        return Ok(());
    }
    Err(err(
        INVALID_URL,
        format!("scheme {scheme} is not allowed for this host"),
    ))
}

pub fn parse_import_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|error| err(INVALID_URL, error))?;
    validate_import_url(&url)?;
    Ok(url)
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

#[derive(Debug)]
pub struct DownloadOutcome {
    pub final_url: Url,
    pub content_disposition: Option<String>,
}

// Downloads to a file on disk chunk by chunk; the archive is never buffered in
// memory. Redirects are followed manually so every hop is re-validated.
pub async fn download_archive_file(
    client: &reqwest::Client,
    url: &Url,
    destination: &Path,
    limits: &ImportLimits,
    progress: &mut ProgressSink,
) -> Result<DownloadOutcome, String> {
    let mut current = url.clone();
    let mut redirects = 0u32;
    loop {
        validate_import_url(&current)?;
        let response = client
            .get(current.clone())
            .send()
            .await
            .map_err(|error| err(DOWNLOAD_FAILED, error))?;
        let status = response.status();
        if status.is_redirection() {
            if redirects >= limits.max_redirects {
                return Err(err(
                    DOWNLOAD_FAILED,
                    format!("too many redirects (status {status})"),
                ));
            }
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| {
                    err(
                        DOWNLOAD_FAILED,
                        format!("redirect without location (status {status})"),
                    )
                })?;
            redirects += 1;
            current = current
                .join(location)
                .map_err(|error| err(INVALID_URL, error))?;
            continue;
        }
        if !status.is_success() {
            return Err(err(DOWNLOAD_FAILED, format!("HTTP {status}")));
        }
        let content_length = response.content_length().unwrap_or(0);
        if content_length > limits.max_archive_bytes {
            return Err(err(
                ARCHIVE_TOO_LARGE,
                format!("declared {content_length} bytes exceeds download limit"),
            ));
        }
        let content_disposition = response
            .headers()
            .get(reqwest::header::CONTENT_DISPOSITION)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        // tokio::fs buffers writes on a blocking thread so the async runtime
        // is never stalled by disk I/O.
        let mut writer = tokio::fs::File::create(destination)
            .await
            .map_err(|e| err(IMPORT_FAILED, e))?;
        progress.begin("downloading", content_length);
        let mut stream = response.bytes_stream();
        let mut total: u64 = 0;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|error| err(DOWNLOAD_FAILED, error))?;
            total += chunk.len() as u64;
            if total > limits.max_archive_bytes {
                return Err(err(
                    ARCHIVE_TOO_LARGE,
                    format!("{total} bytes exceeds download limit"),
                ));
            }
            writer
                .write_all(&chunk)
                .await
                .map_err(|e| err(IMPORT_FAILED, e))?;
            progress.report(total, content_length);
        }
        writer.flush().await.map_err(|e| err(IMPORT_FAILED, e))?;
        progress.end(total, content_length);
        return Ok(DownloadOutcome {
            final_url: current,
            content_disposition,
        });
    }
}

// ---------- Rule A: file name normalization ----------

fn valid_file_id(id: &str) -> bool {
    id.len() <= MAX_FILE_ID_LEN
        && !id.is_empty()
        && id
            .bytes()
            .all(|b| matches!(b, b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'_' | b'-'))
}

fn file_id_for_name(name: &str) -> &str {
    match name.find('.') {
        Some(index) => &name[..index],
        None => name,
    }
}

pub struct FileEntry {
    pub name: String,
    pub is_dir: bool,
}

type RenamePlan = Vec<(String, String)>;

pub fn plan_file_renames(entries: &[FileEntry]) -> Result<RenamePlan, String> {
    let mut taken: HashMap<String, String> = HashMap::new();
    let mut renames = RenamePlan::new();
    for entry in entries {
        if entry.is_dir {
            if entry.name.starts_with('.') {
                continue;
            }
            let key = entry.name.to_lowercase();
            match taken.get(&key) {
                Some(existing) if existing != &entry.name => {
                    return Err(err(
                        FILE_NAME_CONFLICT,
                        format!("{existing} and {} both map to {}", entry.name, entry.name),
                    ));
                }
                _ => {
                    taken.insert(key, entry.name.clone());
                }
            }
        }
    }
    for entry in entries {
        if entry.is_dir || entry.name.starts_with('.') {
            continue;
        }
        let id = file_id_for_name(&entry.name);
        if !valid_file_id(id) {
            return Err(err(
                INVALID_FILE_NAME,
                format!("{} maps to invalid file id {id:?}", entry.name),
            ));
        }
        let key = id.to_lowercase();
        match taken.get(&key) {
            Some(existing) if existing != &entry.name => {
                return Err(err(
                    FILE_NAME_CONFLICT,
                    format!("{existing} and {} both map to {id}", entry.name),
                ));
            }
            _ => {
                taken.insert(key, entry.name.clone());
            }
        }
        if id != entry.name {
            renames.push((entry.name.clone(), id.to_string()));
        }
    }
    Ok(renames)
}

pub fn apply_renames(dir: &Path, renames: &RenamePlan) -> Result<u32, String> {
    let mut applied: RenamePlan = Vec::new();
    for (from, to) in renames {
        match fs::rename(dir.join(from), dir.join(to)) {
            Ok(()) => applied.push((from.clone(), to.clone())),
            Err(error) => {
                for (undo_from, undo_to) in applied.iter().rev() {
                    let _ = fs::rename(dir.join(undo_to), dir.join(undo_from));
                }
                return Err(err(
                    IMPORT_FAILED,
                    format!("rename {from} to {to}: {error}"),
                ));
            }
        }
    }
    Ok(applied.len() as u32)
}

fn list_file_entries(dir: &Path) -> Result<Option<Vec<FileEntry>>, String> {
    match fs::symlink_metadata(dir) {
        Ok(metadata) => {
            let file_type = metadata.file_type();
            if file_type.is_symlink() {
                return Err(err(
                    IMPORT_FAILED,
                    format!("{} is a symbolic link", dir.display()),
                ));
            }
            if !file_type.is_dir() {
                return Err(err(
                    IMPORT_FAILED,
                    format!("{} is not a folder", dir.display()),
                ));
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(err(IMPORT_FAILED, error)),
    }
    let reader = fs::read_dir(dir).map_err(|e| err(IMPORT_FAILED, e))?;
    let mut entries = Vec::new();
    for entry in reader {
        let entry = entry.map_err(|e| err(IMPORT_FAILED, e))?;
        let name = entry.file_name().into_string().map_err(|_| {
            err(
                INVALID_FILE_NAME,
                format!("non-UTF-8 name in {}", dir.display()),
            )
        })?;
        // file_type() never follows symlinks; symlink and other special
        // children are left untouched, like dotfiles.
        let file_type = entry.file_type().map_err(|e| err(IMPORT_FAILED, e))?;
        if !file_type.is_dir() && !file_type.is_file() {
            continue;
        }
        entries.push(FileEntry {
            name,
            is_dir: file_type.is_dir(),
        });
    }
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Some(entries))
}

pub fn normalize_files_dir(dir: &Path) -> Result<u32, String> {
    let Some(entries) = list_file_entries(dir)? else {
        return Ok(0);
    };
    let renames = plan_file_renames(&entries)?;
    apply_renames(dir, &renames)
}

// ---------- Rule B: archive layout, safety, extraction ----------

struct EntryMeta {
    name: String,
    is_dir: bool,
    size: u64,
    segments: Vec<String>,
}

fn validate_entry_mode(mode: Option<u32>, is_dir: bool, name: &str) -> Result<(), String> {
    if let Some(mode) = mode {
        match mode & 0o170000 {
            0 => {}
            0o100000 if !is_dir => {}
            0o040000 if is_dir => {}
            _ => {
                return Err(err(
                    UNSAFE_ARCHIVE_ENTRY,
                    format!("unsupported file type for entry {name:?}"),
                ));
            }
        }
        if mode & 0o170000 == 0o040000 && !is_dir {
            return Err(err(
                UNSAFE_ARCHIVE_ENTRY,
                format!("directory mode without trailing slash for entry {name:?}"),
            ));
        }
    }
    Ok(())
}

fn add_declared_size(total: u64, size: u64, limit: u64) -> Result<u64, String> {
    let total = total
        .checked_add(size)
        .ok_or_else(|| err(ARCHIVE_TOO_LARGE, "declared uncompressed total overflow"))?;
    if total > limit {
        return Err(err(
            ARCHIVE_TOO_LARGE,
            format!("entries declare more than {limit} bytes total"),
        ));
    }
    Ok(total)
}

// Rejects any entry name that could alias another output path: backslashes,
// NUL bytes, empty segments (other than one trailing slash on directories),
// "."/".." segments, and ":" (drive prefixes) are all unsafe. This also
// rejects a leading "./"; Python zipfile archives using that spelling are
// intentionally outside the import format.
pub fn sanitize_zip_entry_path(raw: &str, is_dir: bool) -> Result<Vec<String>, String> {
    if raw.contains('\0') || raw.contains('\\') {
        return Err(err(
            UNSAFE_ARCHIVE_ENTRY,
            format!("NUL byte or backslash in entry {raw:?}"),
        ));
    }
    if raw.starts_with('/') {
        return Err(err(
            UNSAFE_ARCHIVE_ENTRY,
            format!("absolute entry path {raw:?}"),
        ));
    }
    let segments: Vec<&str> = raw.split('/').collect();
    let checked = if is_dir && raw.ends_with('/') {
        segments.len() - 1
    } else {
        segments.len()
    };
    let mut normalized = Vec::new();
    for segment in &segments[..checked] {
        if segment.is_empty() {
            return Err(err(
                UNSAFE_ARCHIVE_ENTRY,
                format!("empty path segment in entry {raw:?}"),
            ));
        }
        if *segment == "." || *segment == ".." {
            return Err(err(
                UNSAFE_ARCHIVE_ENTRY,
                format!("relative path segment in entry {raw:?}"),
            ));
        }
        if segment.contains(':') {
            return Err(err(
                UNSAFE_ARCHIVE_ENTRY,
                format!("drive prefix or reserved character in entry {raw:?}"),
            ));
        }
        normalized.push(segment.to_string());
    }
    Ok(normalized)
}

// ---------- End Of Central Directory inspection ----------

struct Eocd {
    entry_count: u64,
    central_directory_size: u64,
    central_directory_offset: u64,
    central_directory_end: u64,
}

fn read_u16_le(buf: &[u8], offset: usize) -> u16 {
    u16::from_le_bytes([buf[offset], buf[offset + 1]])
}

fn read_u32_le(buf: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes([
        buf[offset],
        buf[offset + 1],
        buf[offset + 2],
        buf[offset + 3],
    ])
}

fn read_u64_le(buf: &[u8], offset: usize) -> u64 {
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&buf[offset..offset + 8]);
    u64::from_le_bytes(bytes)
}

fn read_at<const N: usize>(file: &mut File, offset: u64) -> Result<[u8; N], String> {
    let mut bytes = [0u8; N];
    file.seek(SeekFrom::Start(offset))
        .and_then(|_| file.read_exact(&mut bytes))
        .map_err(|e| err(INVALID_ARCHIVE, e))?;
    Ok(bytes)
}

// The zip crate backtracks across EOCD candidates and collapses duplicate
// names. Pin the only exact-length EOCD and its absolute directory span before
// asking it to parse entries.
fn parse_eocd(file: &mut File) -> Result<Eocd, String> {
    let file_len = file.metadata().map_err(|e| err(INVALID_ARCHIVE, e))?.len();
    let tail_len = file_len.min(EOCD_SEARCH_TAIL_BYTES as u64) as usize;
    if tail_len < EOCD_RECORD_LEN {
        return Err(err(INVALID_ARCHIVE, "file too small to be a zip archive"));
    }
    let mut tail = vec![0u8; tail_len];
    file.seek(SeekFrom::Start(file_len - tail_len as u64))
        .and_then(|_| file.read_exact(&mut tail))
        .map_err(|e| err(INVALID_ARCHIVE, e))?;
    let mut eocd = None;
    for index in 0..=tail_len - EOCD_RECORD_LEN {
        if &tail[index..index + 4] == b"PK\x05\x06"
            && index + EOCD_RECORD_LEN + read_u16_le(&tail, index + 20) as usize == tail_len
            && eocd.replace(index).is_some()
        {
            return Err(err(
                INVALID_ARCHIVE,
                "multiple end of central directory records",
            ));
        }
    }
    let Some(eocd) = eocd else {
        return Err(err(
            INVALID_ARCHIVE,
            "end of central directory record not found",
        ));
    };
    let eocd_pos = file_len - tail_len as u64 + eocd as u64;
    if read_u16_le(&tail, eocd + 4) != 0
        || read_u16_le(&tail, eocd + 6) != 0
        || read_u16_le(&tail, eocd + 8) != read_u16_le(&tail, eocd + 10)
    {
        return Err(err(
            INVALID_ARCHIVE,
            "multi-disk archives are not supported",
        ));
    }
    let entry_count = read_u16_le(&tail, eocd + 10) as u64;
    let cd_size = read_u32_le(&tail, eocd + 12) as u64;
    let cd_offset = read_u32_le(&tail, eocd + 16) as u64;
    if entry_count == 0xFFFF || cd_size == 0xFFFF_FFFF || cd_offset == 0xFFFF_FFFF {
        let locator_pos = eocd_pos
            .checked_sub(ZIP64_LOCATOR_LEN as u64)
            .ok_or_else(|| {
                err(
                    INVALID_ARCHIVE,
                    "zip64 end of central directory locator not found",
                )
            })?;
        let locator = read_at::<ZIP64_LOCATOR_LEN>(file, locator_pos)?;
        if &locator[..4] != b"PK\x06\x07"
            || read_u32_le(&locator, 4) != 0
            || read_u32_le(&locator, 16) != 1
        {
            return Err(err(INVALID_ARCHIVE, "invalid zip64 locator"));
        }
        let zip64_offset = read_u64_le(&locator, 8);
        let record = read_at::<ZIP64_EOCD_RECORD_LEN>(file, zip64_offset)?;
        if &record[..4] != b"PK\x06\x06" {
            return Err(err(
                INVALID_ARCHIVE,
                "zip64 end of central directory record not found",
            ));
        }
        let record_end = zip64_offset
            .checked_add(12)
            .and_then(|offset| offset.checked_add(read_u64_le(&record, 4)))
            .ok_or_else(|| err(INVALID_ARCHIVE, "zip64 record length overflow"))?;
        if read_u64_le(&record, 4) < 44
            || record_end != locator_pos
            || read_u32_le(&record, 16) != 0
            || read_u32_le(&record, 20) != 0
            || read_u64_le(&record, 24) != read_u64_le(&record, 32)
            || (entry_count != 0xFFFF && entry_count != read_u64_le(&record, 32))
            || (cd_size != 0xFFFF_FFFF && cd_size != read_u64_le(&record, 40))
            || (cd_offset != 0xFFFF_FFFF && cd_offset != read_u64_le(&record, 48))
        {
            return Err(err(INVALID_ARCHIVE, "invalid zip64 directory layout"));
        }
        return Ok(Eocd {
            entry_count: read_u64_le(&record, 32),
            central_directory_size: read_u64_le(&record, 40),
            central_directory_offset: read_u64_le(&record, 48),
            central_directory_end: zip64_offset,
        });
    }
    Ok(Eocd {
        entry_count,
        central_directory_size: cd_size,
        central_directory_offset: cd_offset,
        central_directory_end: eocd_pos,
    })
}

fn walk_central_directory(file: &mut File, eocd: &Eocd) -> Result<(), String> {
    let end = eocd
        .central_directory_offset
        .checked_add(eocd.central_directory_size)
        .ok_or_else(|| err(INVALID_ARCHIVE, "central directory offset overflow"))?;
    if end != eocd.central_directory_end {
        return Err(err(
            INVALID_ARCHIVE,
            "central directory does not end at EOCD",
        ));
    }
    let mut cursor = eocd.central_directory_offset;
    let mut buffer = [0u8; 64 * 1024];
    for _ in 0..eocd.entry_count {
        if end - cursor < 46 {
            return Err(err(
                INVALID_ARCHIVE,
                "central directory record is truncated",
            ));
        }
        let header = read_at::<46>(file, cursor)?;
        if &header[..4] != b"PK\x01\x02" {
            return Err(err(INVALID_ARCHIVE, "invalid central directory record"));
        }
        let variable_len = u64::from(read_u16_le(&header, 28))
            + u64::from(read_u16_le(&header, 30))
            + u64::from(read_u16_le(&header, 32));
        cursor += 46;
        if variable_len > end - cursor {
            return Err(err(
                INVALID_ARCHIVE,
                "central directory record exceeds declared size",
            ));
        }
        file.seek(SeekFrom::Start(cursor))
            .map_err(|e| err(INVALID_ARCHIVE, e))?;
        let mut remaining = variable_len;
        while remaining > 0 {
            let chunk = remaining.min(buffer.len() as u64) as usize;
            file.read_exact(&mut buffer[..chunk])
                .map_err(|e| err(INVALID_ARCHIVE, e))?;
            remaining -= chunk as u64;
        }
        cursor += variable_len;
    }
    if cursor != end {
        return Err(err(
            INVALID_ARCHIVE,
            "central directory count does not fill declared size",
        ));
    }
    Ok(())
}

// Strips the detected project-root prefix from an entry's segments.
fn relative_segments(segments: &[String], prefix_segments: &[String]) -> Option<Vec<String>> {
    if prefix_segments.is_empty() {
        return Some(segments.to_vec());
    }
    if segments.len() > prefix_segments.len()
        && segments[..prefix_segments.len()] == prefix_segments[..]
    {
        return Some(segments[prefix_segments.len()..].to_vec());
    }
    None
}

fn detect_project_root(entries: &[EntryMeta]) -> Result<String, String> {
    if entries
        .iter()
        .any(|entry| !entry.is_dir && entry.segments == ["project.db"])
    {
        return Ok(String::new());
    }
    let mut dirs: Vec<&str> = Vec::new();
    for entry in entries {
        if entry.segments.len() == 1 && !entry.is_dir {
            continue;
        }
        if let Some(first) = entry.segments.first()
            && !first.starts_with('.')
            && first != "__MACOSX"
        {
            dirs.push(first.as_str());
        }
    }
    dirs.sort_unstable();
    dirs.dedup();
    if dirs.len() == 1 {
        let dir = dirs[0];
        let has_db = entries.iter().any(|entry| {
            !entry.is_dir
                && entry.segments.len() == 2
                && entry.segments[0] == dir
                && entry.segments[1] == "project.db"
        });
        if has_db {
            return Ok(format!("{dir}/"));
        }
    }
    Err(err(
        INVALID_ARCHIVE,
        "archive root does not contain project.db directly or in a single top-level folder",
    ))
}

fn extract_target(full: &[String]) -> Option<PathBuf> {
    if full.len() == 1 {
        return match full[0].as_str() {
            "project.db" | "project.db-wal" | "project.db-shm" | "project.db-journal" => {
                Some(PathBuf::from(&full[0]))
            }
            _ => None,
        };
    }
    if full.len() == 2 && (full[0] == "files" || full[0] == "file-metadata") {
        return Some(PathBuf::from(&full[0]).join(&full[1]));
    }
    None
}

pub fn extract_project_archive(
    archive_path: &Path,
    out_root: &Path,
    limits: &ImportLimits,
    progress: &mut ProgressSink,
) -> Result<(), String> {
    let mut file = File::open(archive_path).map_err(|e| err(IMPORT_FAILED, e))?;
    let archive_bytes = file.metadata().map_err(|e| err(IMPORT_FAILED, e))?.len();
    if archive_bytes > limits.max_archive_bytes {
        return Err(err(ARCHIVE_TOO_LARGE, "archive exceeds download limit"));
    }
    let eocd = parse_eocd(&mut file)?;
    if eocd.entry_count > limits.max_entries as u64 {
        return Err(err(
            ARCHIVE_TOO_LARGE,
            format!(
                "declared {} entries exceeds limit of {}",
                eocd.entry_count, limits.max_entries
            ),
        ));
    }
    if eocd.central_directory_size > MAX_CENTRAL_DIRECTORY_BYTES {
        return Err(err(
            ARCHIVE_TOO_LARGE,
            format!(
                "central directory declares {} bytes exceeds limit of {}",
                eocd.central_directory_size, MAX_CENTRAL_DIRECTORY_BYTES
            ),
        ));
    }
    walk_central_directory(&mut file, &eocd)?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| err(INVALID_ARCHIVE, e))?;
    if archive.offset() != 0 || archive.central_directory_start() != eocd.central_directory_offset {
        return Err(err(
            INVALID_ARCHIVE,
            "zip reader selected a different central directory",
        ));
    }
    let entry_count = archive.len();
    if entry_count as u64 != eocd.entry_count {
        return Err(err(
            INVALID_ARCHIVE,
            format!(
                "declared {} entries but central directory holds {entry_count} distinct names: duplicate entry names are not allowed",
                eocd.entry_count
            ),
        ));
    }
    let mut metas = Vec::with_capacity(entry_count);
    let mut declared_total = 0u64;
    for index in 0..entry_count {
        let entry = archive
            .by_index(index)
            .map_err(|e| err(INVALID_ARCHIVE, e))?;
        let name = entry.name().to_string();
        let is_dir = entry.is_dir();
        validate_entry_mode(entry.unix_mode(), is_dir, &name)?;
        declared_total =
            add_declared_size(declared_total, entry.size(), limits.max_total_uncompressed)?;
        let segments = sanitize_zip_entry_path(&name, is_dir)?;
        metas.push(EntryMeta {
            name,
            is_dir,
            size: entry.size(),
            segments,
        });
    }
    let prefix = detect_project_root(&metas)?;
    let prefix_segments = if prefix.is_empty() {
        Vec::new()
    } else {
        sanitize_zip_entry_path(&prefix, true)?
    };
    // The incomplete-export marker is checked on the normalized, project-root
    // relative path of every entry, directories included.
    for meta in &metas {
        if let Some(relative) = relative_segments(&meta.segments, &prefix_segments)
            && relative.len() == 1
            && relative[0] == EXPORT_INCOMPLETE_MARKER
        {
            return Err(err(INVALID_ARCHIVE, "archive is marked export-incomplete"));
        }
    }
    // Every entry that would be extracted must claim a unique output path on
    // a case-insensitive filesystem.
    let mut claimed_targets: HashMap<String, String> = HashMap::new();
    let mut targets = Vec::with_capacity(metas.len());
    let mut extraction_total = 0u64;
    for meta in &metas {
        if meta.is_dir || meta.segments.first().is_some_and(|s| s == "__MACOSX") {
            targets.push(None);
            continue;
        }
        let Some(relative) = relative_segments(&meta.segments, &prefix_segments) else {
            targets.push(None);
            continue;
        };
        if relative
            .last()
            .is_some_and(|segment| segment.starts_with('.'))
        {
            targets.push(None);
            continue;
        }
        let Some(target) = extract_target(&relative) else {
            targets.push(None);
            continue;
        };
        let display = relative.join("/");
        let key = display.to_lowercase();
        match claimed_targets.get(&key) {
            Some(existing) => {
                return Err(err(
                    INVALID_ARCHIVE,
                    format!(
                        "entries {existing:?} and {:?} both map to {display:?}",
                        meta.name
                    ),
                ));
            }
            None => {
                claimed_targets.insert(key, meta.name.clone());
            }
        }
        extraction_total += meta.size;
        targets.push(Some(target));
    }
    progress.begin("extracting", extraction_total);
    fs::create_dir_all(out_root.join("files")).map_err(|e| err(IMPORT_FAILED, e))?;
    let mut written_total: u64 = 0;
    for (index, (meta, target)) in metas.iter().zip(&targets).enumerate() {
        let Some(target) = target else {
            continue;
        };
        let mut entry = archive
            .by_index(index)
            .map_err(|e| err(INVALID_ARCHIVE, e))?;
        let out_path = out_root.join(&target);
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(|e| err(IMPORT_FAILED, e))?;
        }
        // create_new never truncates an existing file or writes through a
        // planted symlink; a collision is an error.
        let mut out = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&out_path)
            .map_err(|e| {
                err(
                    INVALID_ARCHIVE,
                    format!("cannot exclusively create {}: {e}", out_path.display()),
                )
            })?;
        let mut entry_written: u64 = 0;
        let mut buf = vec![0u8; 64 * 1024];
        loop {
            match entry.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    entry_written = entry_written
                        .checked_add(n as u64)
                        .ok_or_else(|| err(ARCHIVE_TOO_LARGE, "entry expansion overflow"))?;
                    written_total = written_total
                        .checked_add(n as u64)
                        .ok_or_else(|| err(ARCHIVE_TOO_LARGE, "extracted total overflow"))?;
                    if written_total > limits.max_total_uncompressed {
                        return Err(err(
                            ARCHIVE_TOO_LARGE,
                            format!(
                                "extracted more than {} bytes",
                                limits.max_total_uncompressed
                            ),
                        ));
                    }
                    out.write_all(&buf[..n])
                        .map_err(|e| err(IMPORT_FAILED, e))?;
                    progress.report(written_total.min(extraction_total), extraction_total);
                }
                Err(error) => {
                    return Err(err(
                        INVALID_ARCHIVE,
                        format!("corrupt entry {:?}: {error}", meta.name),
                    ));
                }
            }
        }
        if entry_written != meta.size {
            return Err(err(
                INVALID_ARCHIVE,
                format!(
                    "entry {:?} declares {} bytes but expanded to {entry_written}",
                    meta.name, meta.size
                ),
            ));
        }
    }
    progress.end(written_total, extraction_total);
    Ok(())
}

// ---------- Desktop import orchestration ----------

// Temp locations (desktop): the downloaded archive goes to an OS temp file via
// the tempfile crate (auto-deleted on drop). Extraction goes into a hidden
// staging dir `.routevn-import-<random>` INSIDE the chosen destination parent,
// so the final rename onto its definitive folder name stays on the same volume
// and is atomic. It becomes the final directory on success; on failure the
// temporary staging directory is deleted.
pub fn import_archive_from_disk(
    archive_path: &Path,
    destination_parent: &Path,
    folder_name: &str,
    limits: &ImportLimits,
    progress: &mut ProgressSink,
) -> Result<PathBuf, String> {
    import_archive_with_claim_hook(
        archive_path,
        destination_parent,
        folder_name,
        limits,
        progress,
        &|| {},
    )
}

// before_claim runs after extraction but immediately before the final folder
// name is claimed; tests use it to simulate another process creating the
// destination between selection and claim.
fn import_archive_with_claim_hook(
    archive_path: &Path,
    destination_parent: &Path,
    folder_name: &str,
    limits: &ImportLimits,
    progress: &mut ProgressSink,
    before_claim: &dyn Fn(),
) -> Result<PathBuf, String> {
    import_archive_with_hooks(
        archive_path,
        destination_parent,
        folder_name,
        limits,
        progress,
        before_claim,
        &|| {},
    )
}

fn import_archive_with_hooks(
    archive_path: &Path,
    destination_parent: &Path,
    folder_name: &str,
    limits: &ImportLimits,
    progress: &mut ProgressSink,
    before_claim: &dyn Fn(),
    after_claim: &dyn Fn(),
) -> Result<PathBuf, String> {
    if !destination_parent.is_dir() {
        return Err(err(
            IMPORT_FAILED,
            format!("{} is not a folder", destination_parent.display()),
        ));
    }
    let staging = tempfile::Builder::new()
        .prefix(".routevn-import-")
        .rand_bytes(10)
        .tempdir_in(destination_parent)
        .map_err(|e| err(IMPORT_FAILED, e))?;
    extract_project_archive(archive_path, staging.path(), limits, progress)?;
    normalize_files_dir(&staging.path().join("files"))?;
    // Single top-level folder archives nest under a subfolder of staging.
    let extracted_root = staging_project_root(staging.path())?;
    progress.begin("finishing", 0);
    before_claim();
    promote_staging(
        &extracted_root,
        destination_parent,
        folder_name,
        after_claim,
    )
}

fn staging_project_root(staging: &Path) -> Result<PathBuf, String> {
    let mut roots: Vec<PathBuf> = Vec::new();
    for entry in fs::read_dir(staging).map_err(|e| err(IMPORT_FAILED, e))? {
        let entry = entry.map_err(|e| err(IMPORT_FAILED, e))?;
        let name = entry.file_name().into_string().map_err(|_| {
            err(
                INVALID_ARCHIVE,
                "non-UTF-8 folder name in extracted project",
            )
        })?;
        if name == "project.db" {
            return Ok(staging.to_path_buf());
        }
        roots.push(entry.path());
    }
    roots.sort();
    if roots.len() == 1 && roots[0].is_dir() {
        return Ok(roots[0].clone());
    }
    Err(err(
        INVALID_ARCHIVE,
        "extracted staging has no single project folder",
    ))
}

fn first_available_destination(
    parent: &Path,
    name: &str,
    mut attempt: impl FnMut(&Path) -> Result<bool, String>,
) -> Result<PathBuf, String> {
    let candidates = std::iter::once(parent.join(name))
        .chain((2..10000).map(|suffix| parent.join(format!("{name} {suffix}"))));
    for candidate in candidates {
        if attempt(&candidate)? {
            return Ok(candidate);
        }
    }
    Err(err(
        IMPORT_FAILED,
        format!("could not find a free folder name for {name:?}"),
    ))
}

#[cfg(unix)]
fn promote_staging(
    src: &Path,
    parent: &Path,
    name: &str,
    after_claim: &dyn Fn(),
) -> Result<PathBuf, String> {
    first_available_destination(parent, name, |candidate| {
        match fs::create_dir(candidate) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => return Ok(false),
            Err(error) => return Err(err(IMPORT_FAILED, error)),
        }
        after_claim();
        if let Err(error) = fs::rename(src, candidate) {
            // Only remove our claim if it is still empty. A competitor may
            // have put data in it after the claim.
            let _ = fs::remove_dir(candidate);
            return Err(err(IMPORT_FAILED, format!("promote project: {error}")));
        }
        Ok(true)
    })
}

#[cfg(windows)]
fn promote_staging(
    src: &Path,
    parent: &Path,
    name: &str,
    _after_claim: &dyn Fn(),
) -> Result<PathBuf, String> {
    first_available_destination(parent, name, |candidate| match fs::rename(src, candidate) {
        Ok(()) => Ok(true),
        Err(error)
            if error.kind() == std::io::ErrorKind::AlreadyExists
                || (error.kind() == std::io::ErrorKind::PermissionDenied
                    && fs::symlink_metadata(candidate).is_ok()) =>
        {
            Ok(false)
        }
        Err(error) => Err(err(IMPORT_FAILED, format!("promote project: {error}"))),
    })
}

// ---------- Final folder naming ----------

const WINDOWS_RESERVED_STEMS: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

// Windows rejects these device names case-insensitively, with or without an
// extension (CON.zip has stem CON).
fn is_windows_reserved_name(name: &str) -> bool {
    let stem = file_id_for_name(name);
    WINDOWS_RESERVED_STEMS
        .iter()
        .any(|reserved| stem.eq_ignore_ascii_case(reserved))
}

fn sanitize_folder_name(raw: &str) -> String {
    let mut out = String::new();
    let mut pending_space = false;
    for ch in raw.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-') {
            if pending_space && !out.is_empty() && !out.ends_with('.') {
                out.push(' ');
            }
            pending_space = false;
            out.push(ch);
        } else if ch == ' ' {
            pending_space = true;
        } else if ch == '.' {
            if !out.ends_with('.') {
                out.push('.');
            }
            pending_space = false;
        } else {
            pending_space = true;
        }
    }
    let truncated: String = out.trim_matches([' ', '.']).chars().take(120).collect();
    // Truncation may re-expose trailing dots or spaces, so strip them again.
    let stripped = truncated.trim_end_matches([' ', '.']);
    if is_windows_reserved_name(stripped) {
        return format!("_{stripped}");
    }
    if stripped.is_empty() {
        DEFAULT_FOLDER_NAME.to_string()
    } else {
        stripped.to_string()
    }
}

fn content_disposition_filename(value: &str) -> Option<String> {
    let mut plain: Option<String> = None;
    for part in value.split(';').map(str::trim) {
        let extracted = if let Some(rest) = part.strip_prefix("filename*=") {
            rest.splitn(3, '\'')
                .nth(2)
                .and_then(|encoded| urlencoding::decode(encoded).ok())
                .map(|decoded| decoded.into_owned())
        } else {
            part.strip_prefix("filename=")
                .map(|rest| rest.trim_matches('"').to_string())
        };
        if let Some(name) = extracted {
            if name.is_empty() {
                continue;
            }
            // Use the filename stem, stripping a trailing ".zip" like the URL
            // fallback does.
            let stem = if name.to_lowercase().ends_with(".zip") {
                name[..name.len() - 4].to_string()
            } else {
                Path::new(&name)
                    .file_stem()
                    .map(|stem| stem.to_string_lossy().into_owned())
                    .unwrap_or(name.clone())
            };
            if !stem.is_empty() && plain.is_none() {
                plain = Some(stem);
            }
        }
    }
    plain
}

fn url_last_segment_stem(url: &Url) -> Option<String> {
    let segment = url
        .path_segments()?
        .rfind(|segment| !segment.is_empty())?
        .to_string();
    let decoded = urlencoding::decode(&segment).ok()?.into_owned();
    let stem = if decoded.to_lowercase().ends_with(".zip") {
        decoded[..decoded.len() - 4].to_string()
    } else {
        Path::new(&decoded)
            .file_stem()?
            .to_string_lossy()
            .into_owned()
    };
    if stem.is_empty() { None } else { Some(stem) }
}

pub fn derive_project_folder_name(content_disposition: Option<&str>, final_url: &Url) -> String {
    let candidate = content_disposition
        .and_then(content_disposition_filename)
        .or_else(|| url_last_segment_stem(final_url));
    match candidate {
        Some(candidate) => sanitize_folder_name(&candidate),
        None => DEFAULT_FOLDER_NAME.to_string(),
    }
}

// ---------- Tauri commands ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProjectArchiveResult {
    pub project_path: String,
}

#[tauri::command]
pub async fn download_project_archive(
    url: String,
    destination_parent: String,
    on_progress: tauri::ipc::Channel<ImportProgress>,
) -> Result<DownloadProjectArchiveResult, String> {
    let start_url = parse_import_url(&url)?;
    let destination = PathBuf::from(&destination_parent);
    let limits = ImportLimits::default();
    let client = build_http_client()?;
    // OS temp file via tempfile; auto-deleted when dropped, including on error.
    let archive = tempfile::NamedTempFile::new().map_err(|e| err(IMPORT_FAILED, e))?;
    let archive_path = archive.path().to_path_buf();
    let mut progress = ProgressSink::new(Some(Box::new(move |event| {
        let _ = on_progress.send(event);
    })));
    let outcome =
        download_archive_file(&client, &start_url, archive.path(), &limits, &mut progress).await?;
    let folder_name =
        derive_project_folder_name(outcome.content_disposition.as_deref(), &outcome.final_url);
    let project_path = tauri::async_runtime::spawn_blocking(move || {
        let result = import_archive_from_disk(
            &archive_path,
            &destination,
            &folder_name,
            &limits,
            &mut progress,
        );
        drop(archive);
        result
    })
    .await
    .map_err(|e| err(IMPORT_FAILED, format!("blocking task failed: {e}")))??;
    Ok(DownloadProjectArchiveResult {
        project_path: project_path.to_string_lossy().into_owned(),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizeProjectFileNamesResult {
    pub renamed: u32,
}

#[tauri::command]
pub async fn normalize_project_file_names(
    project_path: String,
) -> Result<NormalizeProjectFileNamesResult, String> {
    let files_dir = PathBuf::from(&project_path).join("files");
    tauri::async_runtime::spawn_blocking(move || {
        let renamed = normalize_files_dir(&files_dir)?;
        Ok(NormalizeProjectFileNamesResult { renamed })
    })
    .await
    .map_err(|e| err(IMPORT_FAILED, format!("blocking task failed: {e}")))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    fn recording_sink() -> (ProgressSink, Arc<Mutex<Vec<ImportProgress>>>) {
        let events = Arc::new(Mutex::new(Vec::new()));
        let received = Arc::clone(&events);
        let sink = ProgressSink::new(Some(Box::new(move |event| {
            received.lock().unwrap().push(event);
        })));
        (sink, events)
    }

    fn file(name: &str) -> FileEntry {
        FileEntry {
            name: name.to_string(),
            is_dir: false,
        }
    }

    fn folder(name: &str) -> FileEntry {
        FileEntry {
            name: name.to_string(),
            is_dir: true,
        }
    }

    fn plan_of(entries: &[FileEntry]) -> Result<RenamePlan, String> {
        plan_file_renames(entries)
    }

    #[test]
    fn planner_renames_extension_to_first_dot() {
        let plan = plan_of(&[file("abc.png")]).unwrap();
        assert_eq!(plan, vec![("abc.png".to_string(), "abc".to_string())]);
        let plan = plan_of(&[file("a_b-1.tar.gz")]).unwrap();
        assert_eq!(
            plan,
            vec![("a_b-1.tar.gz".to_string(), "a_b-1".to_string())]
        );
    }

    #[test]
    fn planner_keeps_extensionless_names() {
        assert!(plan_of(&[file("abc")]).unwrap().is_empty());
    }

    #[test]
    fn planner_ignores_dotfiles_and_directories() {
        let entries = vec![
            file(".DS_Store"),
            file("._abc.png"),
            file(".png"),
            folder("keep.dir"),
        ];
        assert!(plan_of(&entries).unwrap().is_empty());
    }

    #[test]
    fn planner_rejects_invalid_file_ids() {
        assert!(
            plan_of(&[file("a b.png")])
                .unwrap_err()
                .starts_with("invalidFileName")
        );
        assert!(
            plan_of(&[file("é.png")])
                .unwrap_err()
                .starts_with("invalidFileName")
        );
        let long_id = format!("{}.png", "a".repeat(129));
        assert!(
            plan_of(&[file(&long_id)])
                .unwrap_err()
                .starts_with("invalidFileName")
        );
    }

    #[test]
    fn planner_accepts_max_length_id() {
        let max_id = format!("{}.png", "a".repeat(128));
        let plan = plan_of(&[file(&max_id)]).unwrap();
        assert_eq!(plan.len(), 1);
    }

    #[test]
    fn planner_detects_conflicts() {
        let cases: Vec<Vec<FileEntry>> = vec![
            vec![file("abc.png"), file("abc.jpg")],
            vec![file("abc"), file("abc.png")],
            vec![file("ABC.png"), file("abc.png")],
            vec![file("abc"), file("ABC")],
        ];
        for entries in cases {
            let error = plan_of(&entries).unwrap_err();
            assert!(error.starts_with("fileNameConflict"), "{error}");
        }
    }

    #[test]
    fn planner_lets_directory_reserve_its_name() {
        let entries = vec![folder("abc"), file("abc.png")];
        assert!(
            plan_of(&entries)
                .unwrap_err()
                .starts_with("fileNameConflict")
        );
        let entries = vec![folder("pics.old"), file("pics.png")];
        assert_eq!(plan_of(&entries).unwrap().len(), 1);
    }

    #[test]
    fn apply_renames_rolls_back_on_failure() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("1.png"), b"one").unwrap();
        let plan = vec![
            ("1.png".to_string(), "1".to_string()),
            ("missing.png".to_string(), "m".to_string()),
        ];
        let error = apply_renames(dir.path(), &plan).unwrap_err();
        assert!(error.starts_with("importFailed"), "{error}");
        assert_eq!(fs::read(dir.path().join("1.png")).unwrap(), b"one");
        assert!(!dir.path().join("1").exists());
    }

    #[test]
    fn normalize_files_dir_renames_in_place() {
        let dir = tempfile::tempdir().unwrap();
        let files = dir.path().join("files");
        fs::create_dir_all(files.join("sub.dir")).unwrap();
        fs::write(files.join("abc.png"), b"a").unwrap();
        fs::write(files.join("plain"), b"p").unwrap();
        fs::write(files.join(".hidden"), b"h").unwrap();
        fs::write(files.join("sub.dir").join("inner.png"), b"i").unwrap();
        let renamed = normalize_files_dir(&files).unwrap();
        assert_eq!(renamed, 1);
        assert!(files.join("abc").exists());
        assert!(!files.join("abc.png").exists());
        assert!(files.join("plain").exists());
        assert!(files.join(".hidden").exists());
        assert!(files.join("sub.dir").join("inner.png").exists());
    }

    #[test]
    fn normalize_files_dir_returns_zero_when_missing() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(normalize_files_dir(&dir.path().join("files")).unwrap(), 0);
    }

    #[test]
    fn normalize_is_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let files = dir.path().join("files");
        fs::create_dir_all(&files).unwrap();
        fs::write(files.join("abc.png"), b"a").unwrap();
        assert_eq!(normalize_files_dir(&files).unwrap(), 1);
        assert_eq!(normalize_files_dir(&files).unwrap(), 0);
    }

    #[cfg(unix)]
    #[test]
    fn normalize_rejects_files_symlink_and_leaves_symlink_children() {
        // A "files" symlink must never be followed: renames would apply
        // outside the project.
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("abc.png"), b"outside").unwrap();
        let project = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(outside.path(), project.path().join("files")).unwrap();
        let error = normalize_files_dir(&project.path().join("files")).unwrap_err();
        assert!(error.starts_with("importFailed"), "{error}");
        assert!(outside.path().join("abc.png").exists());
        assert!(!outside.path().join("abc").exists());

        // Symlink children are left untouched, like dotfiles.
        let project = tempfile::tempdir().unwrap();
        let files = project.path().join("files");
        fs::create_dir_all(&files).unwrap();
        fs::write(files.join("real.png"), b"r").unwrap();
        std::os::unix::fs::symlink("/nowhere/target", files.join("link.png")).unwrap();
        assert_eq!(normalize_files_dir(&files).unwrap(), 1);
        assert!(files.join("real").exists());
        let meta = fs::symlink_metadata(files.join("link.png")).unwrap();
        assert!(meta.file_type().is_symlink());
    }

    #[test]
    fn sanitize_allows_plain_paths() {
        assert_eq!(
            sanitize_zip_entry_path("files/abc", false).unwrap(),
            vec!["files".to_string(), "abc".to_string()]
        );
        assert_eq!(
            sanitize_zip_entry_path("files/", true).unwrap(),
            vec!["files".to_string()]
        );
        assert_eq!(
            sanitize_zip_entry_path("project.db", false).unwrap(),
            vec!["project.db".to_string()]
        );
    }

    #[test]
    fn sanitize_rejects_unsafe_paths() {
        let cases = [
            ("../evil", false),
            ("files/../evil", false),
            ("/etc/passwd", false),
            ("..\\evil", false),
            ("C:\\evil", false),
            ("files/evil\0", false),
            ("\\\\server\\share", false),
            ("files\\a", false),
            ("files//a", false),
            ("files/./a", false),
            ("files/./a", true),
            ("files//", true),
            ("files/a/", false),
            ("", true),
            ("", false),
            ("a/:b", false),
        ];
        for (name, is_dir) in cases {
            let error = sanitize_zip_entry_path(name, is_dir).unwrap_err();
            assert!(error.starts_with("unsafeArchiveEntry"), "{name}: {error}");
        }
    }

    #[test]
    fn url_validation_follows_rule_c() {
        for raw in [
            "https://example.com/a.zip",
            "https://example.com",
            "http://localhost/a.zip",
            "http://127.0.0.1:8080/a.zip",
            "http://[::1]/a.zip",
        ] {
            parse_import_url(raw).unwrap_or_else(|e| panic!("{raw}: {e}"));
        }
        for raw in [
            "http://example.com/a.zip",
            "ftp://example.com/a.zip",
            "https://user:pass@example.com/a.zip",
            "file:///tmp/a.zip",
            "http://192.168.1.5/a.zip",
            "not a url",
        ] {
            let error = parse_import_url(raw).unwrap_err();
            assert!(error.starts_with("invalidUrl"), "{raw}: {error}");
        }
    }

    fn write_test_zip(path: &Path, entries: &[(&str, &[u8], Option<u32>, zip::CompressionMethod)]) {
        use zip::write::SimpleFileOptions;
        let file = File::create(path).unwrap();
        let mut writer = zip::ZipWriter::new(file);
        for (name, data, mode, method) in entries {
            let mut options = SimpleFileOptions::default().compression_method(*method);
            if let Some(mode) = mode {
                options = options.unix_permissions(*mode);
            }
            if name.ends_with('/') {
                writer
                    .add_directory(name.trim_end_matches('/'), options)
                    .unwrap();
            } else {
                writer.start_file(*name, options).unwrap();
                writer.write_all(data).unwrap();
            }
        }
        writer.finish().unwrap();
    }

    fn extract_zip(
        entries: &[(&str, &[u8], Option<u32>, zip::CompressionMethod)],
        limits: &ImportLimits,
    ) -> Result<tempfile::TempDir, String> {
        let archive_dir = tempfile::tempdir().unwrap();
        let zip_path = archive_dir.path().join("a.zip");
        write_test_zip(&zip_path, entries);
        let out = tempfile::tempdir().unwrap();
        extract_project_archive(&zip_path, out.path(), limits, &mut ProgressSink::new(None))
            .map(|()| out)
    }

    #[test]
    fn extracts_whitelist_and_skips_everything_else() {
        let out = extract_zip(
            &[
                ("project.db", b"db", None, zip::CompressionMethod::Stored),
                (
                    "project.db-wal",
                    b"wal",
                    None,
                    zip::CompressionMethod::Stored,
                ),
                ("README.txt", b"r", None, zip::CompressionMethod::Stored),
                ("__MACOSX/junk", b"j", None, zip::CompressionMethod::Stored),
                (".DS_Store", b"d", None, zip::CompressionMethod::Stored),
                ("files/abc.png", b"a", None, zip::CompressionMethod::Stored),
                (
                    "files/deflated.bin",
                    b"ddd",
                    None,
                    zip::CompressionMethod::Deflated,
                ),
                ("files/.hidden", b"h", None, zip::CompressionMethod::Stored),
                (
                    "files/sub/inner",
                    b"i",
                    None,
                    zip::CompressionMethod::Stored,
                ),
                (
                    "file-metadata/abc.mime",
                    b"m",
                    None,
                    zip::CompressionMethod::Stored,
                ),
                (
                    "nested/other.txt",
                    b"o",
                    None,
                    zip::CompressionMethod::Stored,
                ),
            ],
            &ImportLimits::default(),
        )
        .unwrap();
        let root = out.path();
        assert_eq!(fs::read(root.join("project.db")).unwrap(), b"db");
        assert!(root.join("project.db-wal").exists());
        assert_eq!(fs::read(root.join("files/deflated.bin")).unwrap(), b"ddd");
        assert!(root.join("files/abc.png").exists());
        assert!(root.join("file-metadata/abc.mime").exists());
        assert!(root.join("files").is_dir());
        assert!(!root.join("README.txt").exists());
        assert!(!root.join("__MACOSX").exists());
        assert!(!root.join("files/.hidden").exists());
        assert!(!root.join("files/sub").exists());
        assert!(!root.join("nested").exists());
    }

    #[test]
    fn creates_empty_files_dir_when_absent() {
        let out = extract_zip(
            &[("project.db", b"db", None, zip::CompressionMethod::Stored)],
            &ImportLimits::default(),
        )
        .unwrap();
        assert!(out.path().join("files").is_dir());
    }

    #[test]
    fn rejects_invalid_layouts() {
        let limits = ImportLimits::default();
        let error = extract_zip(
            &[
                (
                    "proj1/project.db",
                    b"db",
                    None,
                    zip::CompressionMethod::Stored,
                ),
                (
                    "proj2/readme.txt",
                    b"r",
                    None,
                    zip::CompressionMethod::Stored,
                ),
            ],
            &limits,
        )
        .unwrap_err();
        assert!(error.starts_with("invalidArchive"), "{error}");
        let error = extract_zip(
            &[("files/a", b"a", None, zip::CompressionMethod::Stored)],
            &limits,
        )
        .unwrap_err();
        assert!(error.starts_with("invalidArchive"), "{error}");
        let error = extract_zip(
            &[
                ("project.db/", b"", None, zip::CompressionMethod::Stored),
                ("other.txt", b"o", None, zip::CompressionMethod::Stored),
            ],
            &limits,
        )
        .unwrap_err();
        assert!(error.starts_with("invalidArchive"), "{error}");
        let error = extract_zip(
            &[
                (
                    "export-incomplete",
                    b"",
                    None,
                    zip::CompressionMethod::Stored,
                ),
                ("project.db", b"db", None, zip::CompressionMethod::Stored),
            ],
            &limits,
        )
        .unwrap_err();
        assert!(error.starts_with("invalidArchive"), "{error}");
        let error = extract_zip(
            &[
                (
                    "P/export-incomplete",
                    b"",
                    None,
                    zip::CompressionMethod::Stored,
                ),
                ("P/project.db", b"db", None, zip::CompressionMethod::Stored),
            ],
            &limits,
        )
        .unwrap_err();
        assert!(error.starts_with("invalidArchive"), "{error}");
    }

    #[test]
    fn rejects_symlink_entries() {
        // The zip writer masks permission bits, so craft a raw entry with
        // S_IFLNK external attributes and unix version-made-by.
        let archive_dir = tempfile::tempdir().unwrap();
        let zip_path = archive_dir.path().join("a.zip");
        let mut entry = raw_entry(b"project.db", b"/etc/passwd");
        entry.external_attrs = 0o120777 << 16;
        write_raw_zip(&zip_path, &[entry]);
        let out = tempfile::tempdir().unwrap();
        let error = extract_project_archive(
            &zip_path,
            out.path(),
            &ImportLimits::default(),
            &mut ProgressSink::new(None),
        )
        .unwrap_err();
        assert!(error.starts_with("unsafeArchiveEntry"), "{error}");
    }

    #[test]
    fn rejects_zip_slip_entries() {
        let limits = ImportLimits::default();
        for name in [
            "../project.db",
            "files/../../evil",
            "/project.db",
            "C:\\evil.txt",
            "files/evil\0",
        ] {
            let error = extract_zip(
                &[
                    ("project.db", b"db", None, zip::CompressionMethod::Stored),
                    (name, b"x", None, zip::CompressionMethod::Stored),
                ],
                &limits,
            )
            .unwrap_err();
            assert!(error.starts_with("unsafeArchiveEntry"), "{name}: {error}");
        }
    }

    #[test]
    fn rejects_non_zip_data() {
        let archive_dir = tempfile::tempdir().unwrap();
        let zip_path = archive_dir.path().join("a.zip");
        fs::write(&zip_path, b"this is not a zip file").unwrap();
        let out = tempfile::tempdir().unwrap();
        let error = extract_project_archive(
            &zip_path,
            out.path(),
            &ImportLimits::default(),
            &mut ProgressSink::new(None),
        )
        .unwrap_err();
        assert!(error.starts_with("invalidArchive"), "{error}");
    }

    #[test]
    fn rejects_too_many_entries() {
        let limits = ImportLimits {
            max_entries: 3,
            ..ImportLimits::default()
        };
        let error = extract_zip(
            &[
                ("project.db", b"db", None, zip::CompressionMethod::Stored),
                ("files/a", b"a", None, zip::CompressionMethod::Stored),
                ("files/b", b"b", None, zip::CompressionMethod::Stored),
                ("files/c", b"c", None, zip::CompressionMethod::Stored),
            ],
            &limits,
        )
        .unwrap_err();
        assert!(error.starts_with("archiveTooLarge"), "{error}");
    }

    #[test]
    fn caps_cumulative_extracted_bytes() {
        let limits = ImportLimits {
            max_total_uncompressed: 10,
            ..ImportLimits::default()
        };
        let error = extract_zip(
            &[
                ("project.db", b"db", None, zip::CompressionMethod::Stored),
                ("files/a", b"12345678", None, zip::CompressionMethod::Stored),
                ("files/b", b"12345678", None, zip::CompressionMethod::Stored),
            ],
            &limits,
        )
        .unwrap_err();
        assert!(error.starts_with("archiveTooLarge"), "{error}");
    }

    struct RawEntry {
        name: Vec<u8>,
        data: Vec<u8>,
        method: u16,
        declared_uncompressed: u32,
        crc: u32,
        external_attrs: u32,
    }

    fn crc32(data: &[u8]) -> u32 {
        let mut crc = !0u32;
        for &byte in data {
            crc ^= byte as u32;
            for _ in 0..8 {
                crc = if crc & 1 != 0 {
                    (crc >> 1) ^ 0xEDB8_8320
                } else {
                    crc >> 1
                };
            }
        }
        !crc
    }

    fn raw_entry(name: &[u8], data: &[u8]) -> RawEntry {
        RawEntry {
            name: name.to_vec(),
            data: data.to_vec(),
            method: 0,
            declared_uncompressed: data.len() as u32,
            crc: crc32(data),
            external_attrs: 0,
        }
    }

    fn raw_zip_bytes(entries: &[RawEntry]) -> Vec<u8> {
        let version_made_by: u16 = (3 << 8) | 20;
        let mut out: Vec<u8> = Vec::new();
        let mut central: Vec<u8> = Vec::new();
        for entry in entries {
            let local_offset = out.len() as u32;
            out.extend_from_slice(&0x04034b50u32.to_le_bytes());
            out.extend_from_slice(&20u16.to_le_bytes());
            out.extend_from_slice(&0u16.to_le_bytes());
            out.extend_from_slice(&entry.method.to_le_bytes());
            out.extend_from_slice(&0x6000u16.to_le_bytes());
            out.extend_from_slice(&0x5A1Au16.to_le_bytes());
            out.extend_from_slice(&entry.crc.to_le_bytes());
            out.extend_from_slice(&(entry.data.len() as u32).to_le_bytes());
            out.extend_from_slice(&entry.declared_uncompressed.to_le_bytes());
            out.extend_from_slice(&(entry.name.len() as u16).to_le_bytes());
            out.extend_from_slice(&0u16.to_le_bytes());
            out.extend_from_slice(&entry.name);
            out.extend_from_slice(&entry.data);
            central.extend_from_slice(&0x02014b50u32.to_le_bytes());
            central.extend_from_slice(&version_made_by.to_le_bytes());
            central.extend_from_slice(&20u16.to_le_bytes());
            central.extend_from_slice(&0u16.to_le_bytes());
            central.extend_from_slice(&entry.method.to_le_bytes());
            central.extend_from_slice(&0x6000u16.to_le_bytes());
            central.extend_from_slice(&0x5A1Au16.to_le_bytes());
            central.extend_from_slice(&entry.crc.to_le_bytes());
            central.extend_from_slice(&(entry.data.len() as u32).to_le_bytes());
            central.extend_from_slice(&entry.declared_uncompressed.to_le_bytes());
            central.extend_from_slice(&(entry.name.len() as u16).to_le_bytes());
            central.extend_from_slice(&0u16.to_le_bytes());
            central.extend_from_slice(&0u16.to_le_bytes());
            central.extend_from_slice(&0u16.to_le_bytes());
            central.extend_from_slice(&0u16.to_le_bytes());
            central.extend_from_slice(&entry.external_attrs.to_le_bytes());
            central.extend_from_slice(&local_offset.to_le_bytes());
            central.extend_from_slice(&entry.name);
        }
        let cd_offset = out.len() as u32;
        let cd_size = central.len() as u32;
        out.extend_from_slice(&central);
        out.extend_from_slice(&0x06054b50u32.to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(&(entries.len() as u16).to_le_bytes());
        out.extend_from_slice(&(entries.len() as u16).to_le_bytes());
        out.extend_from_slice(&cd_size.to_le_bytes());
        out.extend_from_slice(&cd_offset.to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out
    }

    fn write_raw_zip(path: &Path, entries: &[RawEntry]) {
        fs::write(path, raw_zip_bytes(entries)).unwrap();
    }

    fn extract_raw_bytes(bytes: &[u8], limits: &ImportLimits) -> Result<tempfile::TempDir, String> {
        let archive_dir = tempfile::tempdir().unwrap();
        let zip_path = archive_dir.path().join("a.zip");
        fs::write(&zip_path, bytes).unwrap();
        let out = tempfile::tempdir().unwrap();
        extract_project_archive(&zip_path, out.path(), limits, &mut ProgressSink::new(None))
            .map(|()| out)
    }

    fn assert_raw_invalid(bytes: &[u8], code: &str) {
        let error = extract_raw_bytes(bytes, &ImportLimits::default()).unwrap_err();
        assert!(error.starts_with(&format!("{code}: ")), "{error}");
    }

    #[test]
    fn rejects_two_exact_length_eocd_candidates() {
        let mut bytes = raw_zip_bytes(&[raw_entry(b"project.db", b"db")]);
        let eocd = bytes.len() - EOCD_RECORD_LEN;
        bytes[eocd + 20..eocd + 22].copy_from_slice(&22u16.to_le_bytes());
        let mut fake = [0u8; EOCD_RECORD_LEN];
        fake[..4].copy_from_slice(b"PK\x05\x06");
        bytes.extend_from_slice(&fake);
        assert_raw_invalid(&bytes, INVALID_ARCHIVE);
    }

    #[test]
    fn rejects_central_directory_gap_and_trailing_record_bytes() {
        let original = raw_zip_bytes(&[raw_entry(b"project.db", b"db")]);
        let eocd = original.len() - EOCD_RECORD_LEN;
        let mut gap = original.clone();
        gap.splice(eocd..eocd, [1, 2, 3]);
        assert_raw_invalid(&gap, INVALID_ARCHIVE);

        // The declared span reaches the EOCD, but the declared record count
        // leaves three bytes unconsumed after the actual central record.
        let mut trailing = gap;
        let moved_eocd = eocd + 3;
        let old_size = read_u32_le(&trailing, moved_eocd + 12);
        trailing[moved_eocd + 12..moved_eocd + 16].copy_from_slice(&(old_size + 3).to_le_bytes());
        assert_raw_invalid(&trailing, INVALID_ARCHIVE);
    }

    #[test]
    fn rejects_under_and_over_reported_central_record_counts() {
        for second in [
            raw_entry(b"project.db", b"dup"),
            raw_entry(b"export-incomplete", b""),
        ] {
            let original = raw_zip_bytes(&[raw_entry(b"project.db", b"db"), second]);
            let eocd = original.len() - EOCD_RECORD_LEN;
            for count in [1u16, 3u16] {
                let mut bytes = original.clone();
                bytes[eocd + 8..eocd + 10].copy_from_slice(&count.to_le_bytes());
                bytes[eocd + 10..eocd + 12].copy_from_slice(&count.to_le_bytes());
                assert_raw_invalid(&bytes, INVALID_ARCHIVE);
            }
        }
    }

    #[test]
    fn finds_zip64_locator_before_maximum_comment() {
        let original = raw_zip_bytes(&[raw_entry(b"project.db", b"db")]);
        let eocd = original.len() - EOCD_RECORD_LEN;
        let cd_size = read_u32_le(&original, eocd + 12) as u64;
        let cd_offset = read_u32_le(&original, eocd + 16) as u64;
        let mut bytes = original[..eocd].to_vec();
        let zip64_offset = bytes.len() as u64;
        bytes.extend_from_slice(b"PK\x06\x06");
        bytes.extend_from_slice(&44u64.to_le_bytes());
        bytes.extend_from_slice(&45u16.to_le_bytes());
        bytes.extend_from_slice(&45u16.to_le_bytes());
        bytes.extend_from_slice(&0u32.to_le_bytes());
        bytes.extend_from_slice(&0u32.to_le_bytes());
        bytes.extend_from_slice(&1u64.to_le_bytes());
        bytes.extend_from_slice(&1u64.to_le_bytes());
        bytes.extend_from_slice(&cd_size.to_le_bytes());
        bytes.extend_from_slice(&cd_offset.to_le_bytes());
        bytes.extend_from_slice(b"PK\x06\x07");
        bytes.extend_from_slice(&0u32.to_le_bytes());
        bytes.extend_from_slice(&zip64_offset.to_le_bytes());
        bytes.extend_from_slice(&1u32.to_le_bytes());
        let mut eocd_record = original[eocd..].to_vec();
        eocd_record[8..12].copy_from_slice(&[0xff; 4]);
        eocd_record[20..22].copy_from_slice(&u16::MAX.to_le_bytes());
        bytes.extend_from_slice(&eocd_record);
        bytes.resize(bytes.len() + u16::MAX as usize, 0);
        let archive_dir = tempfile::tempdir().unwrap();
        let path = archive_dir.path().join("zip64.zip");
        fs::write(&path, &bytes).unwrap();
        let mut file = File::open(&path).unwrap();
        let parsed = parse_eocd(&mut file).unwrap();
        assert_eq!(parsed.entry_count, 1);
        walk_central_directory(&mut file, &parsed).unwrap();

        let mut prefixed = b"MZ".to_vec();
        prefixed.extend_from_slice(&bytes);
        assert_raw_invalid(&prefixed, INVALID_ARCHIVE);

        let mut conflicting = bytes;
        let eocd = conflicting.len() - u16::MAX as usize - EOCD_RECORD_LEN;
        conflicting[eocd + 16..eocd + 20].copy_from_slice(&((cd_offset + 1) as u32).to_le_bytes());
        assert_raw_invalid(&conflicting, INVALID_ARCHIVE);
    }

    #[test]
    fn rejects_special_modes_even_on_skipped_entries() {
        for mode in [0o010644, 0o020644, 0o140644, 0o060644, 0o120777] {
            let mut special = raw_entry(b"__MACOSX/junk", b"x");
            special.external_attrs = mode << 16;
            let bytes = raw_zip_bytes(&[raw_entry(b"project.db", b"db"), special]);
            assert_raw_invalid(&bytes, UNSAFE_ARCHIVE_ENTRY);
        }
        let mut directory_without_slash = raw_entry(b"files", b"");
        directory_without_slash.external_attrs = 0o040755 << 16;
        let bytes = raw_zip_bytes(&[raw_entry(b"project.db", b"db"), directory_without_slash]);
        assert_raw_invalid(&bytes, UNSAFE_ARCHIVE_ENTRY);
    }

    #[test]
    fn declared_total_includes_skipped_entries_and_checks_overflow() {
        let bytes = raw_zip_bytes(&[
            raw_entry(b"project.db", b"db"),
            raw_entry(b"__MACOSX/junk", b"123456789"),
        ]);
        let limits = ImportLimits {
            max_total_uncompressed: 10,
            ..ImportLimits::default()
        };
        let error = extract_raw_bytes(&bytes, &limits).unwrap_err();
        assert!(error.starts_with("archiveTooLarge: "), "{error}");
        let error = add_declared_size(u64::MAX, 1, u64::MAX).unwrap_err();
        assert!(error.starts_with("archiveTooLarge: "), "{error}");
    }

    #[test]
    fn imports_zip_writer_and_info_zip_style_archives() {
        let out = extract_zip(
            &[
                ("files/", b"", None, zip::CompressionMethod::Stored),
                ("project.db", b"db", None, zip::CompressionMethod::Stored),
                ("files/a", b"aaa", None, zip::CompressionMethod::Deflated),
            ],
            &ImportLimits::default(),
        )
        .unwrap();
        assert_eq!(fs::read(out.path().join("files/a")).unwrap(), b"aaa");

        // Bit 3 and the post-data descriptor are the common Info-ZIP layout.
        let mut bytes = raw_zip_bytes(&[raw_entry(b"project.db", b"db")]);
        let eocd = bytes.len() - EOCD_RECORD_LEN;
        let cd_offset = read_u32_le(&bytes, eocd + 16) as usize;
        bytes[6..8].copy_from_slice(&8u16.to_le_bytes());
        bytes[14..26].fill(0);
        let mut descriptor = Vec::new();
        descriptor.extend_from_slice(b"PK\x07\x08");
        descriptor.extend_from_slice(&crc32(b"db").to_le_bytes());
        descriptor.extend_from_slice(&2u32.to_le_bytes());
        descriptor.extend_from_slice(&2u32.to_le_bytes());
        bytes.splice(cd_offset..cd_offset, descriptor);
        let new_cd_offset = cd_offset + 16;
        bytes[new_cd_offset + 8..new_cd_offset + 10].copy_from_slice(&8u16.to_le_bytes());
        let new_eocd = eocd + 16;
        bytes[new_eocd + 16..new_eocd + 20].copy_from_slice(&(new_cd_offset as u32).to_le_bytes());
        let out = extract_raw_bytes(&bytes, &ImportLimits::default()).unwrap();
        assert_eq!(fs::read(out.path().join("project.db")).unwrap(), b"db");
    }

    #[test]
    fn zip_bomb_lying_header_is_enforced_on_actual_bytes() {
        let payload = "x".repeat(200);
        // A deflate "stored" block inflates to the full payload while the zip
        // headers declare only 4 uncompressed bytes.
        let mut deflated = vec![0x01u8];
        deflated.extend_from_slice(&(payload.len() as u16).to_le_bytes());
        deflated.extend_from_slice(&(!(payload.len() as u16)).to_le_bytes());
        deflated.extend_from_slice(payload.as_bytes());
        let archive_dir = tempfile::tempdir().unwrap();
        let zip_path = archive_dir.path().join("bomb.zip");
        let mut entry = raw_entry(b"project.db", &deflated);
        entry.method = 8;
        entry.declared_uncompressed = 4;
        write_raw_zip(&zip_path, &[entry]);
        let out = tempfile::tempdir().unwrap();
        let limits = ImportLimits {
            max_total_uncompressed: 100,
            ..ImportLimits::default()
        };
        let error =
            extract_project_archive(&zip_path, out.path(), &limits, &mut ProgressSink::new(None))
                .unwrap_err();
        assert!(error.starts_with("archiveTooLarge"), "{error}");
        assert!(fs::read_dir(out.path()).unwrap().count() <= 2);
    }

    #[test]
    fn rejects_duplicate_raw_entry_names() {
        // The zip crate collapses exact duplicate names, hiding the second
        // entry from archive.len(); the EOCD-declared count exposes it.
        let archive_dir = tempfile::tempdir().unwrap();
        let zip_path = archive_dir.path().join("dup.zip");
        write_raw_zip(
            &zip_path,
            &[
                raw_entry(b"project.db", b"first"),
                raw_entry(b"project.db", b"second"),
            ],
        );
        let out = tempfile::tempdir().unwrap();
        let error = extract_project_archive(
            &zip_path,
            out.path(),
            &ImportLimits::default(),
            &mut ProgressSink::new(None),
        )
        .unwrap_err();
        assert!(error.starts_with("invalidArchive"), "{error}");
    }

    #[test]
    fn rejects_case_insensitive_output_collision() {
        let error = extract_zip(
            &[
                ("project.db", b"db", None, zip::CompressionMethod::Stored),
                ("files/A", b"one", None, zip::CompressionMethod::Stored),
                ("files/a", b"two", None, zip::CompressionMethod::Stored),
            ],
            &ImportLimits::default(),
        )
        .unwrap_err();
        assert!(error.starts_with("invalidArchive"), "{error}");
        assert!(error.contains("both map to"), "{error}");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn rejects_unicode_normalization_output_collision() {
        // NFC and NFD spellings differ as strings but name the same file on
        // macOS, so only exclusive file creation catches the collision.
        let error = extract_zip(
            &[
                ("project.db", b"db", None, zip::CompressionMethod::Stored),
                (
                    "files/caf\u{e9}.png",
                    b"one",
                    None,
                    zip::CompressionMethod::Stored,
                ),
                (
                    "files/cafe\u{301}.png",
                    b"two",
                    None,
                    zip::CompressionMethod::Stored,
                ),
            ],
            &ImportLimits::default(),
        )
        .unwrap_err();
        assert!(error.starts_with("invalidArchive"), "{error}");
    }

    #[test]
    fn rejects_declared_entry_count_before_parsing_central_directory() {
        // A zip64 EOCD declaring 1,000,000 entries must be rejected before
        // the central directory is ever parsed.
        let archive_dir = tempfile::tempdir().unwrap();
        let zip_path = archive_dir.path().join("huge-count.zip");
        write_raw_zip(&zip_path, &[raw_entry(b"project.db", b"db")]);
        let original = fs::read(&zip_path).unwrap();
        let eocd = original.len() - 22;
        let cd_size = read_u32_le(&original, eocd + 12) as u64;
        let cd_offset = read_u32_le(&original, eocd + 16) as u64;
        let record_offset = eocd as u64;
        let mut record = Vec::new();
        record.extend_from_slice(&0x06064b50u32.to_le_bytes());
        record.extend_from_slice(&44u64.to_le_bytes());
        record.extend_from_slice(&((3 << 8) | 45u16).to_le_bytes());
        record.extend_from_slice(&45u16.to_le_bytes());
        record.extend_from_slice(&0u32.to_le_bytes());
        record.extend_from_slice(&0u32.to_le_bytes());
        record.extend_from_slice(&1_000_000u64.to_le_bytes());
        record.extend_from_slice(&1_000_000u64.to_le_bytes());
        record.extend_from_slice(&cd_size.to_le_bytes());
        record.extend_from_slice(&cd_offset.to_le_bytes());
        let mut locator = Vec::new();
        locator.extend_from_slice(&0x07064b50u32.to_le_bytes());
        locator.extend_from_slice(&0u32.to_le_bytes());
        locator.extend_from_slice(&record_offset.to_le_bytes());
        locator.extend_from_slice(&1u32.to_le_bytes());
        // zip64 record + locator sit between the central directory and the
        // EOCD; the EOCD's 16-bit count fields defer to the zip64 record.
        let mut bytes = original[..eocd].to_vec();
        bytes.extend_from_slice(&record);
        bytes.extend_from_slice(&locator);
        bytes.extend_from_slice(&original[eocd..]);
        let eocd = bytes.len() - 22;
        bytes[eocd + 8..eocd + 10].copy_from_slice(&0xFFFFu16.to_le_bytes());
        bytes[eocd + 10..eocd + 12].copy_from_slice(&0xFFFFu16.to_le_bytes());
        fs::write(&zip_path, bytes).unwrap();
        let out = tempfile::tempdir().unwrap();
        let error = extract_project_archive(
            &zip_path,
            out.path(),
            &ImportLimits::default(),
            &mut ProgressSink::new(None),
        )
        .unwrap_err();
        assert!(error.starts_with("archiveTooLarge"), "{error}");
        assert!(error.contains("1000000 entries"), "{error}");
    }

    #[test]
    fn rejects_oversized_declared_central_directory() {
        // A declared 1 GiB central directory is rejected before parsing even
        // though the file itself is tiny.
        let archive_dir = tempfile::tempdir().unwrap();
        let zip_path = archive_dir.path().join("huge-cd.zip");
        write_raw_zip(&zip_path, &[raw_entry(b"project.db", b"db")]);
        let mut bytes = fs::read(&zip_path).unwrap();
        let eocd = bytes.len() - 22;
        bytes[eocd + 12..eocd + 16].copy_from_slice(&(1024u32 * 1024 * 1024).to_le_bytes());
        fs::write(&zip_path, bytes).unwrap();
        let out = tempfile::tempdir().unwrap();
        let error = extract_project_archive(
            &zip_path,
            out.path(),
            &ImportLimits::default(),
            &mut ProgressSink::new(None),
        )
        .unwrap_err();
        assert!(error.starts_with("archiveTooLarge"), "{error}");
        assert!(error.contains("central directory"), "{error}");
    }

    #[test]
    fn rejects_entry_size_mismatch_with_valid_crc() {
        // The deflate stream expands to 2 bytes with a matching CRC while the
        // headers declare 1 uncompressed byte.
        let payload = b"ab";
        let mut deflated = vec![0x01u8];
        deflated.extend_from_slice(&(payload.len() as u16).to_le_bytes());
        deflated.extend_from_slice(&(!(payload.len() as u16)).to_le_bytes());
        deflated.extend_from_slice(payload);
        let mut entry = raw_entry(b"project.db", &deflated);
        entry.method = 8;
        entry.declared_uncompressed = 1;
        entry.crc = crc32(payload);
        let archive_dir = tempfile::tempdir().unwrap();
        let zip_path = archive_dir.path().join("size-mismatch.zip");
        write_raw_zip(&zip_path, &[entry]);
        let out = tempfile::tempdir().unwrap();
        let error = extract_project_archive(
            &zip_path,
            out.path(),
            &ImportLimits::default(),
            &mut ProgressSink::new(None),
        )
        .unwrap_err();
        assert!(error.starts_with("invalidArchive"), "{error}");
        assert!(error.contains("expanded"), "{error}");
    }

    #[test]
    fn rejects_export_incomplete_marker_files_and_directories() {
        let limits = ImportLimits::default();
        // Marker as a directory at the archive root.
        let error = extract_zip(
            &[
                (
                    "export-incomplete/",
                    b"",
                    None,
                    zip::CompressionMethod::Stored,
                ),
                ("project.db", b"db", None, zip::CompressionMethod::Stored),
            ],
            &limits,
        )
        .unwrap_err();
        assert!(error.starts_with("invalidArchive"), "{error}");
        // Marker as a directory inside the single top-level folder.
        let error = extract_zip(
            &[
                (
                    "P/export-incomplete/",
                    b"",
                    None,
                    zip::CompressionMethod::Stored,
                ),
                ("P/project.db", b"db", None, zip::CompressionMethod::Stored),
            ],
            &limits,
        )
        .unwrap_err();
        assert!(error.starts_with("invalidArchive"), "{error}");
        // A leading "./" spelling is rejected as an unsafe path segment.
        let error = extract_zip(
            &[
                (
                    "./export-incomplete",
                    b"",
                    None,
                    zip::CompressionMethod::Stored,
                ),
                ("project.db", b"db", None, zip::CompressionMethod::Stored),
            ],
            &limits,
        )
        .unwrap_err();
        assert!(error.starts_with("unsafeArchiveEntry"), "{error}");
    }

    fn write_sample_project_zip(path: &Path) {
        write_test_zip(
            path,
            &[
                ("project.db", b"db", None, zip::CompressionMethod::Stored),
                ("files/x.png", b"x", None, zip::CompressionMethod::Stored),
                (
                    "file-metadata/x.mime",
                    b"image/png",
                    None,
                    zip::CompressionMethod::Stored,
                ),
            ],
        );
    }

    #[test]
    fn imports_nested_folder_archive_and_normalizes_names() {
        let archive_dir = tempfile::tempdir().unwrap();
        let zip_path = archive_dir.path().join("a.zip");
        write_test_zip(
            &zip_path,
            &[
                (
                    "My Project/project.db",
                    b"db",
                    None,
                    zip::CompressionMethod::Stored,
                ),
                (
                    "My Project/files/x.png",
                    b"x",
                    None,
                    zip::CompressionMethod::Stored,
                ),
            ],
        );
        let parent = tempfile::tempdir().unwrap();
        let project_path = import_archive_from_disk(
            &zip_path,
            parent.path(),
            "Imported",
            &ImportLimits::default(),
            &mut ProgressSink::new(None),
        )
        .unwrap();
        assert_eq!(project_path, parent.path().join("Imported"));
        assert!(project_path.join("project.db").exists());
        assert!(project_path.join("files/x").exists());
        assert!(!project_path.join("files/x.png").exists());
        let mut leftover: Vec<_> = fs::read_dir(parent.path())
            .unwrap()
            .map(|entry| entry.unwrap().file_name().into_string().unwrap())
            .collect();
        leftover.sort();
        assert_eq!(leftover, vec!["Imported".to_string()]);
    }

    #[test]
    fn import_appends_unique_suffix_and_never_overwrites() {
        let archive_dir = tempfile::tempdir().unwrap();
        let zip_path = archive_dir.path().join("a.zip");
        write_sample_project_zip(&zip_path);
        let parent = tempfile::tempdir().unwrap();
        fs::create_dir_all(parent.path().join("Imported")).unwrap();
        fs::write(parent.path().join("Imported/sentinel"), b"keep").unwrap();
        let project_path = import_archive_from_disk(
            &zip_path,
            parent.path(),
            "Imported",
            &ImportLimits::default(),
            &mut ProgressSink::new(None),
        )
        .unwrap();
        assert_eq!(project_path, parent.path().join("Imported 2"));
        assert!(project_path.join("project.db").exists());
        assert!(project_path.join("file-metadata/x.mime").exists());
        assert_eq!(
            fs::read(parent.path().join("Imported/sentinel")).unwrap(),
            b"keep"
        );
    }

    #[test]
    fn import_skips_multiple_claimed_folder_names() {
        let archive_dir = tempfile::tempdir().unwrap();
        let zip_path = archive_dir.path().join("a.zip");
        write_sample_project_zip(&zip_path);
        let parent = tempfile::tempdir().unwrap();
        fs::create_dir_all(parent.path().join("Imported")).unwrap();
        fs::create_dir_all(parent.path().join("Imported 2")).unwrap();
        let project_path = import_archive_from_disk(
            &zip_path,
            parent.path(),
            "Imported",
            &ImportLimits::default(),
            &mut ProgressSink::new(None),
        )
        .unwrap();
        assert_eq!(project_path, parent.path().join("Imported 3"));
        assert!(project_path.join("project.db").exists());
    }

    #[test]
    fn import_survives_folder_claimed_by_another_process() {
        // The folder is created by a competing process between extraction and
        // the claim; the import must land beside it, never replace it.
        let archive_dir = tempfile::tempdir().unwrap();
        let zip_path = archive_dir.path().join("a.zip");
        write_sample_project_zip(&zip_path);
        let parent = tempfile::tempdir().unwrap();
        let parent_path = parent.path().to_path_buf();
        let project_path = import_archive_with_claim_hook(
            &zip_path,
            &parent_path,
            "Imported",
            &ImportLimits::default(),
            &mut ProgressSink::new(None),
            &|| {
                fs::create_dir_all(parent_path.join("Imported")).unwrap();
            },
        )
        .unwrap();
        assert_eq!(project_path, parent_path.join("Imported 2"));
        assert!(project_path.join("project.db").exists());
        // The competing empty folder survives untouched.
        assert_eq!(
            fs::read_dir(parent_path.join("Imported")).unwrap().count(),
            0
        );
    }

    #[cfg(unix)]
    #[test]
    fn competitor_populating_claimed_folder_blocks_promotion_without_data_loss() {
        let archive_dir = tempfile::tempdir().unwrap();
        let zip_path = archive_dir.path().join("a.zip");
        write_sample_project_zip(&zip_path);
        let parent = tempfile::tempdir().unwrap();
        let claimed = parent.path().join("Imported");
        let error = import_archive_with_hooks(
            &zip_path,
            parent.path(),
            "Imported",
            &ImportLimits::default(),
            &mut ProgressSink::new(None),
            &|| {},
            &|| fs::write(claimed.join("competitor"), b"keep").unwrap(),
        )
        .unwrap_err();
        assert!(error.starts_with("importFailed: "), "{error}");
        assert_eq!(fs::read(claimed.join("competitor")).unwrap(), b"keep");
        let names: Vec<_> = fs::read_dir(parent.path())
            .unwrap()
            .map(|entry| entry.unwrap().file_name().into_string().unwrap())
            .collect();
        assert_eq!(names, vec!["Imported"]);
    }

    #[test]
    fn suffix_loop_uses_injected_rename_attempt_on_every_platform() {
        let parent = tempfile::tempdir().unwrap();
        let source = parent.path().join("staging");
        fs::create_dir(&source).unwrap();
        fs::write(source.join("project.db"), b"db").unwrap();
        let mut attempts = Vec::new();
        let destination = first_available_destination(parent.path(), "Imported", |candidate| {
            attempts.push(
                candidate
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .into_owned(),
            );
            if attempts.len() < 3 {
                return Ok(false);
            }
            fs::rename(&source, candidate).map_err(|e| err(IMPORT_FAILED, e))?;
            Ok(true)
        })
        .unwrap();
        assert_eq!(attempts, ["Imported", "Imported 2", "Imported 3"]);
        assert_eq!(destination, parent.path().join("Imported 3"));
        assert_eq!(fs::read(destination.join("project.db")).unwrap(), b"db");
    }

    #[test]
    fn import_cleans_staging_on_failure() {
        let archive_dir = tempfile::tempdir().unwrap();
        let zip_path = archive_dir.path().join("a.zip");
        fs::write(&zip_path, b"not a zip").unwrap();
        let parent = tempfile::tempdir().unwrap();
        let error = import_archive_from_disk(
            &zip_path,
            parent.path(),
            "Imported",
            &ImportLimits::default(),
            &mut ProgressSink::new(None),
        )
        .unwrap_err();
        assert!(error.starts_with("invalidArchive"), "{error}");
        assert_eq!(fs::read_dir(parent.path()).unwrap().count(), 0);
    }

    #[test]
    fn derives_folder_names() {
        let url = Url::parse("https://x.io/download").unwrap();
        assert_eq!(
            derive_project_folder_name(Some("attachment; filename=\"My Trip.zip\""), &url),
            "My Trip"
        );
        assert_eq!(
            derive_project_folder_name(Some("attachment; filename*=UTF-8''%E6%97%85.zip"), &url),
            "RouteVN Project"
        );
        let url = Url::parse("https://x.io/feeds/my-project.zip").unwrap();
        assert_eq!(derive_project_folder_name(None, &url), "my-project");
        let url = Url::parse("https://x.io/a:b?c.zip").unwrap();
        assert_eq!(derive_project_folder_name(None, &url), "a b");
        let url = Url::parse("https://x.io/").unwrap();
        assert_eq!(derive_project_folder_name(None, &url), "RouteVN Project");
    }

    #[test]
    fn folder_names_avoid_windows_reserved_and_trailing_dots() {
        assert_eq!(sanitize_folder_name("CON.zip"), "_CON.zip");
        assert_eq!(sanitize_folder_name("NUL"), "_NUL");
        assert_eq!(sanitize_folder_name("aux"), "_aux");
        assert_eq!(sanitize_folder_name("COM1.zip"), "_COM1.zip");
        assert_eq!(sanitize_folder_name("lpt9"), "_lpt9");
        assert_eq!(sanitize_folder_name("prn.tar.gz"), "_prn.tar.gz");
        assert_eq!(sanitize_folder_name("control"), "control");
        assert_eq!(sanitize_folder_name("console"), "console");
        let url = Url::parse("https://x.io/COM1.zip").unwrap();
        assert_eq!(derive_project_folder_name(None, &url), "_COM1");
        // Truncation must never leave a trailing dot or space.
        let truncated = sanitize_folder_name(&format!("{}.x", "A".repeat(119)));
        assert_eq!(truncated.len(), 119);
        assert!(!truncated.ends_with('.'));
        assert!(!truncated.ends_with(' '));
        let padded = sanitize_folder_name(&format!("{}. ", "B".repeat(120)));
        assert_eq!(padded.len(), 120);
        assert!(!padded.ends_with('.'));
        assert!(!padded.ends_with(' '));
        assert_eq!(sanitize_folder_name("..."), DEFAULT_FOLDER_NAME);
        assert_eq!(sanitize_folder_name("  "), DEFAULT_FOLDER_NAME);
    }

    fn spawn_server_bytes(responses: Vec<Vec<u8>>) -> Url {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            for response in responses {
                let Ok((mut stream, _)) = listener.accept() else {
                    break;
                };
                let mut buf = [0u8; 8192];
                let _ = stream.read(&mut buf);
                let _ = stream.write_all(&response);
                let _ = stream.flush();
            }
        });
        Url::parse(&format!("http://{addr}/archive.zip")).unwrap()
    }

    fn spawn_server(responses: Vec<String>) -> Url {
        spawn_server_bytes(responses.into_iter().map(String::into_bytes).collect())
    }

    fn run_download(
        url: &Url,
        destination: &Path,
        limits: &ImportLimits,
    ) -> Result<DownloadOutcome, String> {
        let client = build_http_client().unwrap();
        tauri::async_runtime::block_on(download_archive_file(
            &client,
            url,
            destination,
            limits,
            &mut ProgressSink::new(None),
        ))
    }

    #[test]
    fn download_succeeds_and_streams_to_file() {
        let body = "PK-fake-archive-body-".repeat(10);
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Disposition: attachment; filename=\"Proj.zip\"\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        let url = spawn_server(vec![response]);
        let dir = tempfile::tempdir().unwrap();
        let destination = dir.path().join("archive.zip");
        let outcome = run_download(&url, &destination, &ImportLimits::default()).unwrap();
        assert_eq!(fs::read(&destination).unwrap(), body.as_bytes());
        assert_eq!(outcome.final_url, url);
        assert_eq!(
            outcome.content_disposition.as_deref(),
            Some("attachment; filename=\"Proj.zip\"")
        );
    }

    #[test]
    fn download_fails_on_http_error_status() {
        let url = spawn_server(vec![
            "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string(),
        ]);
        let dir = tempfile::tempdir().unwrap();
        let error =
            run_download(&url, &dir.path().join("a.zip"), &ImportLimits::default()).unwrap_err();
        assert!(error.starts_with("downloadFailed"), "{error}");
        assert!(error.contains("404"), "{error}");
    }

    #[test]
    fn download_follows_loopback_redirect() {
        let url = spawn_server(vec![
            "HTTP/1.1 302 Found\r\nLocation: /next.zip\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string(),
            "HTTP/1.1 200 OK\r\nContent-Length: 3\r\nConnection: close\r\n\r\nabc".to_string(),
        ]);
        let dir = tempfile::tempdir().unwrap();
        let destination = dir.path().join("a.zip");
        let outcome = run_download(&url, &destination, &ImportLimits::default()).unwrap();
        assert_eq!(fs::read(&destination).unwrap(), b"abc");
        assert!(outcome.final_url.path().ends_with("/next.zip"));
    }

    #[test]
    fn download_rejects_redirect_to_non_loopback_http() {
        let url = spawn_server(vec![
            "HTTP/1.1 302 Found\r\nLocation: http://example.com/evil.zip\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_string(),
        ]);
        let dir = tempfile::tempdir().unwrap();
        let error =
            run_download(&url, &dir.path().join("a.zip"), &ImportLimits::default()).unwrap_err();
        assert!(error.starts_with("invalidUrl"), "{error}");
    }

    #[test]
    fn download_rejects_redirect_chain_over_limit() {
        let redirect = "HTTP/1.1 302 Found\r\nLocation: /archive.zip\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        let url = spawn_server(vec![redirect.to_string(); 10]);
        let dir = tempfile::tempdir().unwrap();
        let error =
            run_download(&url, &dir.path().join("a.zip"), &ImportLimits::default()).unwrap_err();
        assert!(error.starts_with("downloadFailed"), "{error}");
        assert!(error.contains("redirect"), "{error}");
    }

    #[test]
    fn download_aborts_when_archive_exceeds_limit() {
        let body = "x".repeat(4096);
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        let url = spawn_server(vec![response]);
        let dir = tempfile::tempdir().unwrap();
        let limits = ImportLimits {
            max_archive_bytes: 1024,
            ..ImportLimits::default()
        };
        let error = run_download(&url, &dir.path().join("a.zip"), &limits).unwrap_err();
        assert!(error.starts_with("archiveTooLarge"), "{error}");
    }

    #[test]
    fn download_progress_starts_at_zero_and_finishes_at_body_length() {
        let body = "archive-body-".repeat(100);
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        let url = spawn_server(vec![response]);
        let dir = tempfile::tempdir().unwrap();
        let destination = dir.path().join("archive.zip");
        let (mut sink, received) = recording_sink();
        let client = build_http_client().unwrap();
        tauri::async_runtime::block_on(download_archive_file(
            &client,
            &url,
            &destination,
            &ImportLimits::default(),
            &mut sink,
        ))
        .unwrap();
        let events = received.lock().unwrap();
        assert!(events.len() >= 2);
        assert!(events.iter().all(|event| event.stage == "downloading"));
        assert_eq!(events[0].current, 0);
        assert!(
            events
                .windows(2)
                .all(|pair| pair[0].current <= pair[1].current)
        );
        let last = events.last().unwrap();
        assert_eq!(last.current, body.len() as u64);
        assert!(events.iter().all(|event| event.total == body.len() as u64));
    }

    #[test]
    fn extraction_progress_counts_only_written_entry_bytes() {
        let archive_dir = tempfile::tempdir().unwrap();
        let zip_path = archive_dir.path().join("a.zip");
        let large = vec![b'x'; 256 * 1024];
        write_test_zip(
            &zip_path,
            &[
                ("project.db", b"db", None, zip::CompressionMethod::Stored),
                (
                    "files/large",
                    &large,
                    None,
                    zip::CompressionMethod::Deflated,
                ),
                (
                    "README.txt",
                    b"skipped",
                    None,
                    zip::CompressionMethod::Stored,
                ),
            ],
        );
        let out = tempfile::tempdir().unwrap();
        let (mut sink, received) = recording_sink();
        extract_project_archive(&zip_path, out.path(), &ImportLimits::default(), &mut sink)
            .unwrap();
        let events = received.lock().unwrap();
        let expected = 2 + large.len() as u64;
        assert!(events.len() >= 2);
        assert!(events.iter().all(|event| event.stage == "extracting"));
        assert_eq!(events[0].current, 0);
        assert!(
            events
                .iter()
                .all(|event| event.total == expected && event.current <= expected)
        );
        assert!(
            events
                .windows(2)
                .all(|pair| pair[0].current <= pair[1].current)
        );
        assert_eq!(events.last().unwrap().current, expected);
        assert_eq!(fs::read(out.path().join("files/large")).unwrap(), large);
    }

    #[test]
    fn import_progress_orders_download_extraction_and_finishing() {
        let archive_dir = tempfile::tempdir().unwrap();
        let zip_path = archive_dir.path().join("source.zip");
        write_sample_project_zip(&zip_path);
        let body = fs::read(&zip_path).unwrap();
        let mut response = format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        )
        .into_bytes();
        response.extend_from_slice(&body);
        let url = spawn_server_bytes(vec![response]);
        let destination = archive_dir.path().join("downloaded.zip");
        let parent = tempfile::tempdir().unwrap();
        let (mut sink, received) = recording_sink();
        let client = build_http_client().unwrap();
        tauri::async_runtime::block_on(download_archive_file(
            &client,
            &url,
            &destination,
            &ImportLimits::default(),
            &mut sink,
        ))
        .unwrap();
        let imported = import_archive_from_disk(
            &destination,
            parent.path(),
            "Project One",
            &ImportLimits::default(),
            &mut sink,
        )
        .unwrap();
        assert!(imported.join("project.db").exists());
        let events = received.lock().unwrap();
        let stages: Vec<&str> = events.iter().map(|event| event.stage.as_str()).collect();
        assert_eq!(stages.first(), Some(&"downloading"));
        assert_eq!(stages.last(), Some(&"finishing"));
        assert_eq!(
            stages.iter().filter(|stage| **stage == "finishing").count(),
            1
        );
        let extracting_start = stages
            .iter()
            .position(|stage| *stage == "extracting")
            .unwrap();
        let finishing_start = stages
            .iter()
            .position(|stage| *stage == "finishing")
            .unwrap();
        assert!(
            stages[..extracting_start]
                .iter()
                .all(|stage| *stage == "downloading")
        );
        assert!(
            stages[extracting_start..finishing_start]
                .iter()
                .all(|stage| *stage == "extracting")
        );
        assert_eq!(
            (
                events[finishing_start].current,
                events[finishing_start].total
            ),
            (0, 0)
        );
    }

    #[test]
    fn absent_progress_sink_preserves_import_result() {
        let archive_dir = tempfile::tempdir().unwrap();
        let zip_path = archive_dir.path().join("a.zip");
        write_sample_project_zip(&zip_path);
        let parent = tempfile::tempdir().unwrap();
        let imported = import_archive_from_disk(
            &zip_path,
            parent.path(),
            "Project One",
            &ImportLimits::default(),
            &mut ProgressSink::new(None),
        )
        .unwrap();
        assert_eq!(fs::read(imported.join("project.db")).unwrap(), b"db");
        assert_eq!(fs::read(imported.join("files/x")).unwrap(), b"x");
        assert_eq!(
            fs::read(imported.join("file-metadata/x.mime")).unwrap(),
            b"image/png"
        );
    }
}
