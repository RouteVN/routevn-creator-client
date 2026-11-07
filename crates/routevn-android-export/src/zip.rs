//! Minimal ZIP reader and writer for APKs.
//!
//! The writer exists so the exporter controls every byte that matters to
//! Android: uncompressed entries are aligned like `zipalign -P 16 4`, entry
//! timestamps are fixed, and no ZIP64 records or signing data are written.
//! Unchanged template entries are copied with their compressed bytes intact.

use std::fs::File;
use std::io::{BufWriter, Read, Seek, SeekFrom, Write};

use crate::error::{ExportError, Result};

const LOCAL_HEADER_SIGNATURE: u32 = 0x0403_4b50;
const CENTRAL_HEADER_SIGNATURE: u32 = 0x0201_4b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE: u32 = 0x0605_4b50;
const LOCAL_HEADER_SIZE: u64 = 30;
const CENTRAL_HEADER_SIZE: usize = 46;
const END_OF_CENTRAL_DIRECTORY_SIZE: usize = 22;
const MAX_COMMENT_SIZE: usize = 0xFFFF;
const APK_SIGNING_BLOCK_MAGIC: &[u8; 16] = b"APK Sig Block 42";

/// zipalign's extra field: header id, data size, alignment, zero padding.
const ALIGNMENT_EXTRA_ID: u16 = 0xD935;
const ALIGNMENT_EXTRA_MIN_SIZE: u64 = 6;

pub const METHOD_STORED: u16 = 0;
pub const METHOD_DEFLATED: u16 = 8;
const FLAG_DATA_DESCRIPTOR: u16 = 0x0008;
const FLAG_UTF8: u16 = 0x0800;

/// 1981-01-01 01:01:02, the fixed timestamp Android build tools also use.
const FIXED_DOS_TIME: u16 = (1 << 11) | (1 << 5) | 1;
const FIXED_DOS_DATE: u16 = ((1981 - 1980) << 9) | (1 << 5) | 1;

const ZIP32_LIMIT: u64 = 0xFFFF_FFFE;
const MAX_ENTRY_COUNT: usize = 0xFFFE;

pub const DEFAULT_ALIGNMENT: u64 = 4;
pub const NATIVE_LIBRARY_ALIGNMENT: u64 = 16 * 1024;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ZipEntry {
    pub name: String,
    pub method: u16,
    pub flags: u16,
    pub crc32: u32,
    pub compressed_size: u64,
    pub uncompressed_size: u64,
    pub local_header_offset: u64,
    pub data_offset: u64,
    pub external_attributes: u32,
}

impl ZipEntry {
    pub fn is_stored(&self) -> bool {
        self.method == METHOD_STORED
    }
}

#[derive(Debug)]
pub struct ZipIndex {
    /// Entries in local-header order, which is the order they appear in the
    /// file.
    pub entries: Vec<ZipEntry>,
    pub central_directory_offset: u64,
    pub has_apk_signing_block: bool,
}

impl ZipIndex {
    pub fn entry(&self, name: &str) -> Option<&ZipEntry> {
        self.entries.iter().find(|entry| entry.name == name)
    }
}

fn read_u16(bytes: &[u8], offset: usize) -> u16 {
    u16::from_le_bytes([bytes[offset], bytes[offset + 1]])
}

fn read_u32(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes([
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3],
    ])
}

fn io_error(context: &str, error: std::io::Error) -> ExportError {
    ExportError::template(format!("{context}: {error}"))
}

pub fn read_index(file: &mut File) -> Result<ZipIndex> {
    let file_len = file
        .metadata()
        .map_err(|error| io_error("Failed to read the APK size", error))?
        .len();
    let tail_len = file_len.min((END_OF_CENTRAL_DIRECTORY_SIZE + MAX_COMMENT_SIZE) as u64);
    let tail_start = file_len - tail_len;
    let tail = read_at(file, tail_start, tail_len as usize)?;

    let eocd_position = (0..=tail.len().saturating_sub(END_OF_CENTRAL_DIRECTORY_SIZE))
        .rev()
        .find(|&position| {
            read_u32(&tail, position) == END_OF_CENTRAL_DIRECTORY_SIGNATURE
                && position
                    + END_OF_CENTRAL_DIRECTORY_SIZE
                    + read_u16(&tail, position + 20) as usize
                    == tail.len()
        })
        .ok_or_else(|| ExportError::template("The APK has no ZIP end record."))?;
    let eocd = &tail[eocd_position..];

    let disk_number = read_u16(eocd, 4);
    let central_directory_disk = read_u16(eocd, 6);
    let entries_on_disk = read_u16(eocd, 8);
    let entry_count = read_u16(eocd, 10);
    let central_directory_size = read_u32(eocd, 12);
    let central_directory_offset = read_u32(eocd, 16);
    if disk_number != 0 || central_directory_disk != 0 || entries_on_disk != entry_count {
        return Err(ExportError::template(
            "Multi-disk ZIP files are not supported.",
        ));
    }
    if entry_count == 0xFFFF
        || central_directory_size == 0xFFFF_FFFF
        || central_directory_offset == 0xFFFF_FFFF
    {
        return Err(ExportError::template("ZIP64 APKs are not supported."));
    }

    let central_directory = read_at(
        file,
        u64::from(central_directory_offset),
        central_directory_size as usize,
    )?;
    let mut entries = Vec::with_capacity(entry_count as usize);
    let mut cursor = 0usize;
    for _ in 0..entry_count {
        if cursor + CENTRAL_HEADER_SIZE > central_directory.len()
            || read_u32(&central_directory, cursor) != CENTRAL_HEADER_SIGNATURE
        {
            return Err(ExportError::template(
                "The APK central directory is damaged.",
            ));
        }
        let header = &central_directory[cursor..];
        let flags = read_u16(header, 8);
        let method = read_u16(header, 10);
        let crc32 = read_u32(header, 16);
        let compressed_size = read_u32(header, 20);
        let uncompressed_size = read_u32(header, 24);
        let name_len = read_u16(header, 28) as usize;
        let extra_len = read_u16(header, 30) as usize;
        let comment_len = read_u16(header, 32) as usize;
        let external_attributes = read_u32(header, 38);
        let local_header_offset = read_u32(header, 42);
        if compressed_size == 0xFFFF_FFFF
            || uncompressed_size == 0xFFFF_FFFF
            || local_header_offset == 0xFFFF_FFFF
        {
            return Err(ExportError::template(
                "ZIP64 APK entries are not supported.",
            ));
        }
        let name_end = CENTRAL_HEADER_SIZE + name_len;
        if cursor + name_end > central_directory.len() {
            return Err(ExportError::template(
                "The APK central directory is damaged.",
            ));
        }
        let name = String::from_utf8(header[CENTRAL_HEADER_SIZE..name_end].to_vec())
            .map_err(|_| ExportError::template("An APK entry name is not valid UTF-8."))?;
        if method != METHOD_STORED && method != METHOD_DEFLATED {
            return Err(ExportError::template(format!(
                "APK entry {name} uses unsupported compression method {method}."
            )));
        }

        let local_header = read_at(
            file,
            u64::from(local_header_offset),
            LOCAL_HEADER_SIZE as usize,
        )?;
        if read_u32(&local_header, 0) != LOCAL_HEADER_SIGNATURE {
            return Err(ExportError::template(format!(
                "APK entry {name} has a damaged local header."
            )));
        }
        let local_name_len = u64::from(read_u16(&local_header, 26));
        let local_extra_len = u64::from(read_u16(&local_header, 28));
        let data_offset =
            u64::from(local_header_offset) + LOCAL_HEADER_SIZE + local_name_len + local_extra_len;
        if data_offset + u64::from(compressed_size) > u64::from(central_directory_offset) {
            return Err(ExportError::template(format!(
                "APK entry {name} extends past the entry data area."
            )));
        }

        entries.push(ZipEntry {
            name,
            method,
            flags,
            crc32,
            compressed_size: u64::from(compressed_size),
            uncompressed_size: u64::from(uncompressed_size),
            local_header_offset: u64::from(local_header_offset),
            data_offset,
            external_attributes,
        });
        cursor += name_end + extra_len + comment_len;
    }
    entries.sort_by_key(|entry| entry.local_header_offset);

    let has_apk_signing_block = central_directory_offset >= 16 && {
        let magic = read_at(file, u64::from(central_directory_offset) - 16, 16)?;
        magic.as_slice() == APK_SIGNING_BLOCK_MAGIC
    };

    Ok(ZipIndex {
        entries,
        central_directory_offset: u64::from(central_directory_offset),
        has_apk_signing_block,
    })
}

pub fn read_at(file: &mut File, offset: u64, length: usize) -> Result<Vec<u8>> {
    file.seek(SeekFrom::Start(offset))
        .map_err(|error| io_error("Failed to seek in the APK", error))?;
    let mut bytes = vec![0u8; length];
    file.read_exact(&mut bytes)
        .map_err(|error| io_error("Failed to read the APK", error))?;
    Ok(bytes)
}

/// Returns the uncompressed bytes of an entry and checks its CRC.
pub fn read_entry(file: &mut File, entry: &ZipEntry) -> Result<Vec<u8>> {
    let compressed_len = usize::try_from(entry.compressed_size)
        .map_err(|_| ExportError::template(format!("APK entry {} is too large.", entry.name)))?;
    let raw = read_at(file, entry.data_offset, compressed_len)?;
    let bytes = match entry.method {
        METHOD_STORED => raw,
        _ => miniz_oxide::inflate::decompress_to_vec(&raw).map_err(|error| {
            ExportError::template(format!(
                "Failed to decompress APK entry {}: {error:?}",
                entry.name
            ))
        })?,
    };
    if bytes.len() as u64 != entry.uncompressed_size || crc32(&bytes) != entry.crc32 {
        return Err(ExportError::template(format!(
            "APK entry {} failed its integrity check.",
            entry.name
        )));
    }
    Ok(bytes)
}

static CRC_TABLE: std::sync::LazyLock<[u32; 256]> = std::sync::LazyLock::new(|| {
    let mut table = [0u32; 256];
    for (index, value) in table.iter_mut().enumerate() {
        let mut crc = index as u32;
        for _ in 0..8 {
            crc = if crc & 1 == 1 {
                0xEDB8_8320 ^ (crc >> 1)
            } else {
                crc >> 1
            };
        }
        *value = crc;
    }
    table
});

#[derive(Clone, Copy, Debug)]
pub struct Crc32(u32);

impl Default for Crc32 {
    fn default() -> Self {
        Self(0xFFFF_FFFF)
    }
}

impl Crc32 {
    pub fn update(&mut self, bytes: &[u8]) {
        let table = &*CRC_TABLE;
        for byte in bytes {
            self.0 = table[((self.0 ^ u32::from(*byte)) & 0xFF) as usize] ^ (self.0 >> 8);
        }
    }

    pub fn finish(self) -> u32 {
        self.0 ^ 0xFFFF_FFFF
    }
}

pub fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = Crc32::default();
    crc.update(bytes);
    crc.finish()
}

/// Alignment Android expects for an uncompressed entry's data.
pub fn required_alignment(name: &str) -> u64 {
    if name.starts_with("lib/") && name.ends_with(".so") {
        NATIVE_LIBRARY_ALIGNMENT
    } else {
        DEFAULT_ALIGNMENT
    }
}

struct CentralRecord {
    name: String,
    method: u16,
    flags: u16,
    crc32: u32,
    compressed_size: u32,
    uncompressed_size: u32,
    local_header_offset: u32,
    external_attributes: u32,
}

pub struct ZipWriter {
    output: BufWriter<File>,
    offset: u64,
    records: Vec<CentralRecord>,
}

impl ZipWriter {
    pub fn new(file: File) -> Self {
        Self {
            output: BufWriter::with_capacity(1024 * 1024, file),
            offset: 0,
            records: Vec::new(),
        }
    }

    pub fn offset(&self) -> u64 {
        self.offset
    }

    /// Copies an entry's compressed data unchanged from `source`.
    pub fn copy_entry(&mut self, source: &mut File, entry: &ZipEntry) -> Result<()> {
        let alignment = entry.is_stored().then(|| required_alignment(&entry.name));
        self.write_local_header(
            &entry.name,
            entry.method,
            entry.flags,
            entry.crc32,
            entry.compressed_size,
            entry.uncompressed_size,
            alignment,
        )?;
        source
            .seek(SeekFrom::Start(entry.data_offset))
            .map_err(|error| {
                ExportError::write(format!("Failed to read template entry: {error}"))
            })?;
        let mut limited = source.take(entry.compressed_size);
        let copied = std::io::copy(&mut limited, &mut self.output)
            .map_err(|error| ExportError::write(format!("Failed to copy APK entry: {error}")))?;
        if copied != entry.compressed_size {
            return Err(ExportError::write(format!(
                "Template entry {} ended early.",
                entry.name
            )));
        }
        self.offset += copied;
        if let Some(record) = self.records.last_mut() {
            record.external_attributes = entry.external_attributes;
        }
        Ok(())
    }

    /// Writes an uncompressed entry from memory.
    pub fn add_stored(&mut self, name: &str, bytes: &[u8]) -> Result<()> {
        let size = bytes.len() as u64;
        self.write_local_header(
            name,
            METHOD_STORED,
            0,
            crc32(bytes),
            size,
            size,
            Some(required_alignment(name)),
        )?;
        self.output
            .write_all(bytes)
            .map_err(|error| ExportError::write(format!("Failed to write APK entry: {error}")))?;
        self.offset += size;
        Ok(())
    }

    /// Streams an uncompressed entry from a file whose CRC is already known.
    pub fn add_stored_file(
        &mut self,
        name: &str,
        source: &mut File,
        crc32: u32,
        size: u64,
    ) -> Result<()> {
        self.write_local_header(
            name,
            METHOD_STORED,
            0,
            crc32,
            size,
            size,
            Some(required_alignment(name)),
        )?;
        source.seek(SeekFrom::Start(0)).map_err(|error| {
            ExportError::write(format!("Failed to read the game package: {error}"))
        })?;
        let mut limited = source.take(size);
        let copied = std::io::copy(&mut limited, &mut self.output).map_err(|error| {
            ExportError::write(format!("Failed to write the game package: {error}"))
        })?;
        if copied != size {
            return Err(ExportError::write(
                "The game package changed while it was written.",
            ));
        }
        self.offset += copied;
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    fn write_local_header(
        &mut self,
        name: &str,
        method: u16,
        flags: u16,
        crc32: u32,
        compressed_size: u64,
        uncompressed_size: u64,
        alignment: Option<u64>,
    ) -> Result<()> {
        if self.records.len() >= MAX_ENTRY_COUNT {
            return Err(too_large("The APK would have too many entries."));
        }
        let name_bytes = name.as_bytes();
        let name_len = u16::try_from(name_bytes.len())
            .map_err(|_| ExportError::write(format!("APK entry name {name} is too long.")))?;
        let header_end = self.offset + LOCAL_HEADER_SIZE + u64::from(name_len);
        let padding = alignment.map_or(0, |alignment| alignment_padding(header_end, alignment));
        let data_end = header_end + padding + compressed_size;
        if self.offset > ZIP32_LIMIT || data_end > ZIP32_LIMIT || uncompressed_size > ZIP32_LIMIT {
            return Err(too_large(
                "The APK would be larger than 4 GB, which Android cannot install.",
            ));
        }

        let flags = (flags & !FLAG_DATA_DESCRIPTOR & FLAG_UTF8)
            | if name.is_ascii() { 0 } else { FLAG_UTF8 };
        let version_needed: u16 = if method == METHOD_DEFLATED { 20 } else { 10 };
        let mut header =
            Vec::with_capacity(LOCAL_HEADER_SIZE as usize + name_bytes.len() + padding as usize);
        header.extend_from_slice(&LOCAL_HEADER_SIGNATURE.to_le_bytes());
        header.extend_from_slice(&version_needed.to_le_bytes());
        header.extend_from_slice(&flags.to_le_bytes());
        header.extend_from_slice(&method.to_le_bytes());
        header.extend_from_slice(&FIXED_DOS_TIME.to_le_bytes());
        header.extend_from_slice(&FIXED_DOS_DATE.to_le_bytes());
        header.extend_from_slice(&crc32.to_le_bytes());
        header.extend_from_slice(&(compressed_size as u32).to_le_bytes());
        header.extend_from_slice(&(uncompressed_size as u32).to_le_bytes());
        header.extend_from_slice(&name_len.to_le_bytes());
        header.extend_from_slice(&(padding as u16).to_le_bytes());
        header.extend_from_slice(name_bytes);
        if padding > 0 {
            header.extend_from_slice(&ALIGNMENT_EXTRA_ID.to_le_bytes());
            header.extend_from_slice(&((padding - 4) as u16).to_le_bytes());
            header
                .extend_from_slice(&(alignment.unwrap_or(DEFAULT_ALIGNMENT) as u16).to_le_bytes());
            header.resize(
                header.len() + (padding - ALIGNMENT_EXTRA_MIN_SIZE) as usize,
                0,
            );
        }
        self.output.write_all(&header).map_err(|error| {
            ExportError::write(format!("Failed to write APK entry header: {error}"))
        })?;

        self.records.push(CentralRecord {
            name: name.to_string(),
            method,
            flags,
            crc32,
            compressed_size: compressed_size as u32,
            uncompressed_size: uncompressed_size as u32,
            local_header_offset: self.offset as u32,
            external_attributes: 0,
        });
        self.offset += header.len() as u64;
        Ok(())
    }

    pub fn finish(mut self) -> Result<File> {
        let central_directory_offset = self.offset;
        let mut central_directory = Vec::new();
        for record in &self.records {
            let version_needed: u16 = if record.method == METHOD_DEFLATED {
                20
            } else {
                10
            };
            central_directory.extend_from_slice(&CENTRAL_HEADER_SIGNATURE.to_le_bytes());
            central_directory.extend_from_slice(&version_needed.to_le_bytes());
            central_directory.extend_from_slice(&version_needed.to_le_bytes());
            central_directory.extend_from_slice(&record.flags.to_le_bytes());
            central_directory.extend_from_slice(&record.method.to_le_bytes());
            central_directory.extend_from_slice(&FIXED_DOS_TIME.to_le_bytes());
            central_directory.extend_from_slice(&FIXED_DOS_DATE.to_le_bytes());
            central_directory.extend_from_slice(&record.crc32.to_le_bytes());
            central_directory.extend_from_slice(&record.compressed_size.to_le_bytes());
            central_directory.extend_from_slice(&record.uncompressed_size.to_le_bytes());
            central_directory.extend_from_slice(&(record.name.len() as u16).to_le_bytes());
            central_directory.extend_from_slice(&0u16.to_le_bytes());
            central_directory.extend_from_slice(&0u16.to_le_bytes());
            central_directory.extend_from_slice(&0u16.to_le_bytes());
            central_directory.extend_from_slice(&0u16.to_le_bytes());
            central_directory.extend_from_slice(&record.external_attributes.to_le_bytes());
            central_directory.extend_from_slice(&record.local_header_offset.to_le_bytes());
            central_directory.extend_from_slice(record.name.as_bytes());
        }
        let end = central_directory_offset + central_directory.len() as u64;
        if end + END_OF_CENTRAL_DIRECTORY_SIZE as u64 > ZIP32_LIMIT {
            return Err(too_large(
                "The APK would be larger than 4 GB, which Android cannot install.",
            ));
        }
        let count = self.records.len() as u16;
        central_directory.extend_from_slice(&END_OF_CENTRAL_DIRECTORY_SIGNATURE.to_le_bytes());
        central_directory.extend_from_slice(&0u16.to_le_bytes());
        central_directory.extend_from_slice(&0u16.to_le_bytes());
        central_directory.extend_from_slice(&count.to_le_bytes());
        central_directory.extend_from_slice(&count.to_le_bytes());
        central_directory
            .extend_from_slice(&((end - central_directory_offset) as u32).to_le_bytes());
        central_directory.extend_from_slice(&(central_directory_offset as u32).to_le_bytes());
        central_directory.extend_from_slice(&0u16.to_le_bytes());

        self.output.write_all(&central_directory).map_err(|error| {
            ExportError::write(format!("Failed to write the APK directory: {error}"))
        })?;
        let file = self.output.into_inner().map_err(|error| {
            ExportError::write(format!("Failed to flush the APK: {}", error.error()))
        })?;
        file.sync_all()
            .map_err(|error| ExportError::write(format!("Failed to flush the APK: {error}")))?;
        Ok(file)
    }
}

fn too_large(message: &str) -> ExportError {
    ExportError::new(crate::error::ErrorCode::TooLarge, message)
}

/// Extra-field bytes needed so data starting after `header_end` is aligned.
/// Padding is either zero or at least the size of zipalign's extra field.
fn alignment_padding(header_end: u64, alignment: u64) -> u64 {
    let mut padding = (alignment - header_end % alignment) % alignment;
    while padding != 0 && padding < ALIGNMENT_EXTRA_MIN_SIZE {
        padding += alignment;
    }
    padding
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crc32_matches_reference_value() {
        assert_eq!(crc32(b"123456789"), 0xCBF4_3926);
        assert_eq!(crc32(b""), 0);
    }

    #[test]
    fn alignment_padding_is_zero_or_fits_the_extra_field() {
        for header_end in 0..64u64 {
            for alignment in [4u64, 16 * 1024] {
                let padding = alignment_padding(header_end, alignment);
                assert_eq!((header_end + padding) % alignment, 0);
                assert!(padding == 0 || padding >= ALIGNMENT_EXTRA_MIN_SIZE);
                assert!(padding < alignment + ALIGNMENT_EXTRA_MIN_SIZE + alignment);
            }
        }
    }

    #[test]
    fn writes_aligned_stored_entries_and_reads_them_back() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("test.apk");
        let mut writer = ZipWriter::new(File::create(&path).unwrap());
        writer.add_stored("a", b"x").unwrap();
        writer
            .add_stored("lib/arm64-v8a/libgame.so", &[7u8; 100])
            .unwrap();
        writer.add_stored("assets/data.bin", b"hello").unwrap();
        writer.finish().unwrap();

        let mut file = File::open(&path).unwrap();
        let index = read_index(&mut file).unwrap();
        assert_eq!(index.entries.len(), 3);
        assert!(!index.has_apk_signing_block);
        for entry in &index.entries {
            assert_eq!(
                entry.data_offset % required_alignment(&entry.name),
                0,
                "{}",
                entry.name
            );
        }
        let library = index.entry("lib/arm64-v8a/libgame.so").unwrap();
        assert_eq!(library.data_offset % NATIVE_LIBRARY_ALIGNMENT, 0);
        assert_eq!(read_entry(&mut file, library).unwrap(), vec![7u8; 100]);
        assert_eq!(
            read_entry(&mut file, index.entry("assets/data.bin").unwrap()).unwrap(),
            b"hello"
        );

        let copy_path = temp.path().join("copy.apk");
        let mut copy = ZipWriter::new(File::create(&copy_path).unwrap());
        copy.add_stored("first-entry-shifts-offsets", b"123")
            .unwrap();
        for entry in &index.entries {
            copy.copy_entry(&mut file, entry).unwrap();
        }
        copy.finish().unwrap();
        let mut copied_file = File::open(&copy_path).unwrap();
        let copied = read_index(&mut copied_file).unwrap();
        for entry in &copied.entries {
            assert_eq!(entry.data_offset % required_alignment(&entry.name), 0);
        }
        assert_eq!(
            read_entry(&mut copied_file, copied.entry("assets/data.bin").unwrap()).unwrap(),
            b"hello"
        );
    }

    #[test]
    fn reads_deflated_entries() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("deflated.apk");
        let content = b"<manifest/> repeated repeated repeated repeated".repeat(20);
        let compressed = miniz_oxide::deflate::compress_to_vec(&content, 6);
        let mut writer = ZipWriter::new(File::create(&path).unwrap());
        writer
            .write_local_header(
                "AndroidManifest.xml",
                METHOD_DEFLATED,
                0,
                crc32(&content),
                compressed.len() as u64,
                content.len() as u64,
                None,
            )
            .unwrap();
        writer.output.write_all(&compressed).unwrap();
        writer.offset += compressed.len() as u64;
        writer.finish().unwrap();

        let mut file = File::open(&path).unwrap();
        let index = read_index(&mut file).unwrap();
        let entry = index.entry("AndroidManifest.xml").unwrap();
        assert_eq!(entry.method, METHOD_DEFLATED);
        assert_eq!(read_entry(&mut file, entry).unwrap(), content);
    }
}
