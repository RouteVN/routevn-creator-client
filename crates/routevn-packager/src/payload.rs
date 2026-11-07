use std::fs;
use std::io::{BufReader, BufWriter, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

use chacha20poly1305::aead::{Aead, AeadCore, KeyInit, OsRng};
use chacha20poly1305::{Key, XChaCha20Poly1305, XNonce};
use sha2::{Digest, Sha256};

use crate::authenticode::{self, PE_HEADER_WINDOW, SignatureFields};
use crate::errors::{PackagerError, Result};

const FOOTER_MAGIC: [u8; 16] = *b"RVNEXEPAYLOAD001";
const FOOTER_VERSION: u32 = 1;
const CHUNKED_FOOTER_MAGIC: [u8; 16] = *b"RVNEXEPAYLOAD002";
const CHUNKED_FOOTER_VERSION: u32 = 2;
const KEY_SIZE: usize = 32;
const NONCE_SIZE: usize = 24;
const FOOTER_SIZE: usize = 16 + 4 + 8 + 8 + 8 + NONCE_SIZE + KEY_SIZE;
const CHUNKED_FOOTER_SIZE: usize = 16 + 4 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + NONCE_SIZE + KEY_SIZE;
const CHUNK_TABLE_ENTRY_SIZE: usize = 8 + 8;
const KEY_MASK_LABEL: &[u8] = b"routevn-player-payload-key-v1";
const SEGMENT_NONCE_LABEL: &[u8] = b"routevn-player-payload-segment-v2";

pub const DEFAULT_PAYLOAD_CHUNK_SIZE: usize = 1024 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PayloadKey(pub [u8; KEY_SIZE]);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PayloadNonce(pub [u8; NONCE_SIZE]);

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EmbeddedPayloadFooter {
    pub version: u32,
    pub encrypted_offset: u64,
    pub encrypted_len: u64,
    pub plaintext_len: u64,
    pub nonce: PayloadNonce,
    key_envelope: [u8; KEY_SIZE],
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EmbeddedChunkedPayloadFooter {
    pub version: u32,
    pub encrypted_offset: u64,
    pub encrypted_len: u64,
    pub table_offset: u64,
    pub table_len: u64,
    pub plaintext_len: u64,
    pub chunk_size: u64,
    pub segment_count: u64,
    pub nonce: PayloadNonce,
    key_envelope: [u8; KEY_SIZE],
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EmbeddedPayloadMetadata {
    pub plaintext_len: u64,
    pub chunk_size: u64,
    pub segment_count: u64,
}

#[derive(Debug)]
pub struct AppendPayloadRequest<'a> {
    pub template_path: &'a Path,
    pub output_path: &'a Path,
    pub payload: &'a [u8],
    pub key: PayloadKey,
    pub nonce: PayloadNonce,
}

#[derive(Debug)]
pub struct AppendChunkedPayloadRequest<'a> {
    pub template_path: &'a Path,
    pub output_path: &'a Path,
    pub payload: &'a [u8],
    pub key: PayloadKey,
    pub nonce: PayloadNonce,
    pub chunk_size: usize,
}

#[derive(Debug)]
pub struct WriteStandaloneChunkedPayloadRequest<'a> {
    pub output_path: &'a Path,
    pub payload: &'a [u8],
    pub key: PayloadKey,
    pub nonce: PayloadNonce,
    pub chunk_size: usize,
}

#[derive(Debug)]
pub struct AppendPayloadOutcome {
    pub output_path: PathBuf,
    pub footer: EmbeddedPayloadFooter,
}

#[derive(Debug)]
pub struct AppendChunkedPayloadOutcome {
    pub output_path: PathBuf,
    pub footer: EmbeddedChunkedPayloadFooter,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct ChunkedPayloadTableEntry {
    plaintext_len: u64,
    encrypted_len: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct ChunkedPayloadSegment {
    plaintext_offset: u64,
    plaintext_len: u64,
    encrypted_offset: u64,
    encrypted_len: u64,
}

pub fn encrypt_payload(payload: &[u8], key: PayloadKey, nonce: PayloadNonce) -> Result<Vec<u8>> {
    let key = Key::from(key.0);
    let nonce = XNonce::from(nonce.0);
    let cipher = XChaCha20Poly1305::new(&key);
    cipher
        .encrypt(&nonce, payload)
        .map_err(|_| PackagerError::PayloadCrypto {
            message: "failed to encrypt payload".to_string(),
        })
}

pub fn decrypt_payload(
    encrypted_payload: &[u8],
    key: PayloadKey,
    nonce: PayloadNonce,
) -> Result<Vec<u8>> {
    let key = Key::from(key.0);
    let nonce = XNonce::from(nonce.0);
    let cipher = XChaCha20Poly1305::new(&key);
    cipher
        .decrypt(&nonce, encrypted_payload)
        .map_err(|_| PackagerError::PayloadCrypto {
            message: "failed to decrypt payload".to_string(),
        })
}

pub fn generate_payload_key_material() -> (PayloadKey, PayloadNonce) {
    let key = XChaCha20Poly1305::generate_key(&mut OsRng);
    let nonce = XChaCha20Poly1305::generate_nonce(&mut OsRng);
    let mut key_bytes = [0u8; KEY_SIZE];
    let mut nonce_bytes = [0u8; NONCE_SIZE];

    key_bytes.copy_from_slice(&key);
    nonce_bytes.copy_from_slice(&nonce);

    (PayloadKey(key_bytes), PayloadNonce(nonce_bytes))
}

pub fn append_encrypted_payload(request: AppendPayloadRequest<'_>) -> Result<AppendPayloadOutcome> {
    let mut output_bytes =
        fs::read(request.template_path).map_err(|source| PackagerError::ReadFile {
            path: request.template_path.to_path_buf(),
            source,
        })?;
    let encrypted_payload = encrypt_payload(request.payload, request.key, request.nonce)?;
    let encrypted_offset = output_bytes.len() as u64;
    let footer = EmbeddedPayloadFooter {
        version: FOOTER_VERSION,
        encrypted_offset,
        encrypted_len: encrypted_payload.len() as u64,
        plaintext_len: request.payload.len() as u64,
        nonce: request.nonce,
        key_envelope: wrap_payload_key(&output_bytes, request.key, request.nonce),
    };

    output_bytes.extend_from_slice(&encrypted_payload);
    output_bytes.extend_from_slice(&serialize_footer(&footer));

    if let Some(parent) = request.output_path.parent() {
        fs::create_dir_all(parent).map_err(|source| PackagerError::CreateDir {
            path: parent.to_path_buf(),
            source,
        })?;
    }

    fs::write(request.output_path, output_bytes).map_err(|source| PackagerError::WriteFile {
        path: request.output_path.to_path_buf(),
        source,
    })?;

    Ok(AppendPayloadOutcome {
        output_path: request.output_path.to_path_buf(),
        footer,
    })
}

pub fn append_chunked_encrypted_payload(
    request: AppendChunkedPayloadRequest<'_>,
) -> Result<AppendChunkedPayloadOutcome> {
    let prefix_bytes =
        fs::read(request.template_path).map_err(|source| PackagerError::ReadFile {
            path: request.template_path.to_path_buf(),
            source,
        })?;

    write_chunked_encrypted_payload(
        prefix_bytes,
        request.output_path,
        request.payload,
        request.key,
        request.nonce,
        request.chunk_size,
    )
}

pub fn write_standalone_chunked_encrypted_payload(
    request: WriteStandaloneChunkedPayloadRequest<'_>,
) -> Result<AppendChunkedPayloadOutcome> {
    write_chunked_encrypted_payload(
        Vec::new(),
        request.output_path,
        request.payload,
        request.key,
        request.nonce,
        request.chunk_size,
    )
}

fn write_chunked_encrypted_payload(
    mut output_bytes: Vec<u8>,
    output_path: &Path,
    payload: &[u8],
    key: PayloadKey,
    nonce: PayloadNonce,
    chunk_size: usize,
) -> Result<AppendChunkedPayloadOutcome> {
    if chunk_size == 0 {
        return Err(invalid_payload(
            output_path,
            "chunk size must be greater than zero",
        ));
    }

    let prefix_len = output_bytes.len();
    let encrypted_offset = prefix_len as u64;
    let mut table_entries = Vec::new();

    for (segment_index, chunk) in payload.chunks(chunk_size).enumerate() {
        let segment_nonce = derive_segment_nonce(nonce, segment_index as u64);
        let encrypted_segment = encrypt_payload(chunk, key, segment_nonce)?;
        table_entries.push(ChunkedPayloadTableEntry {
            plaintext_len: chunk.len() as u64,
            encrypted_len: encrypted_segment.len() as u64,
        });
        output_bytes.extend_from_slice(&encrypted_segment);
    }

    let table_offset = output_bytes.len() as u64;
    let table_bytes = serialize_chunk_table(&table_entries);
    output_bytes.extend_from_slice(&table_bytes);

    let footer = EmbeddedChunkedPayloadFooter {
        version: CHUNKED_FOOTER_VERSION,
        encrypted_offset,
        encrypted_len: table_offset - encrypted_offset,
        table_offset,
        table_len: table_bytes.len() as u64,
        plaintext_len: payload.len() as u64,
        chunk_size: chunk_size as u64,
        segment_count: table_entries.len() as u64,
        nonce,
        key_envelope: wrap_payload_key(&output_bytes[..prefix_len], key, nonce),
    };

    output_bytes.extend_from_slice(&serialize_chunked_footer(&footer));

    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|source| PackagerError::CreateDir {
            path: parent.to_path_buf(),
            source,
        })?;
    }

    fs::write(output_path, output_bytes).map_err(|source| PackagerError::WriteFile {
        path: output_path.to_path_buf(),
        source,
    })?;

    Ok(AppendChunkedPayloadOutcome {
        output_path: output_path.to_path_buf(),
        footer,
    })
}

#[derive(Debug)]
pub struct WriteStandaloneChunkedPayloadFromFileRequest<'a> {
    pub input_path: &'a Path,
    pub output_path: &'a Path,
    pub key: PayloadKey,
    pub nonce: PayloadNonce,
    pub chunk_size: usize,
}

/// Streams `input_path` into a standalone chunked payload at `output_path`.
///
/// The output is byte-for-byte what `write_standalone_chunked_encrypted_payload`
/// writes for the same plaintext, but only one segment is held in memory at a
/// time, so packages larger than the available memory can be encrypted.
/// `on_progress` receives the plaintext bytes processed and the total.
pub fn write_standalone_chunked_encrypted_payload_from_file(
    request: WriteStandaloneChunkedPayloadFromFileRequest<'_>,
    mut on_progress: impl FnMut(u64, u64),
) -> Result<AppendChunkedPayloadOutcome> {
    let WriteStandaloneChunkedPayloadFromFileRequest {
        input_path,
        output_path,
        key,
        nonce,
        chunk_size,
    } = request;

    if chunk_size == 0 {
        return Err(invalid_payload(
            output_path,
            "chunk size must be greater than zero",
        ));
    }

    let read_error = |source| PackagerError::ReadFile {
        path: input_path.to_path_buf(),
        source,
    };
    let write_error = |source| PackagerError::WriteFile {
        path: output_path.to_path_buf(),
        source,
    };

    let input = fs::File::open(input_path).map_err(read_error)?;
    let input_len = input.metadata().map_err(read_error)?.len();
    let mut reader = BufReader::with_capacity(chunk_size, input);

    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|source| PackagerError::CreateDir {
            path: parent.to_path_buf(),
            source,
        })?;
    }
    let output = fs::File::create(output_path).map_err(write_error)?;
    let mut writer = BufWriter::with_capacity(chunk_size, output);

    let mut buffer = vec![0u8; chunk_size];
    let mut table_entries = Vec::new();
    let mut plaintext_len = 0u64;
    let mut encrypted_len = 0u64;

    loop {
        let filled = read_until_full(&mut reader, &mut buffer).map_err(read_error)?;
        if filled == 0 {
            break;
        }

        let segment_nonce = derive_segment_nonce(nonce, table_entries.len() as u64);
        let encrypted_segment = encrypt_payload(&buffer[..filled], key, segment_nonce)?;
        writer.write_all(&encrypted_segment).map_err(write_error)?;
        table_entries.push(ChunkedPayloadTableEntry {
            plaintext_len: filled as u64,
            encrypted_len: encrypted_segment.len() as u64,
        });
        plaintext_len += filled as u64;
        encrypted_len += encrypted_segment.len() as u64;
        on_progress(plaintext_len, input_len);

        if filled < chunk_size {
            break;
        }
    }

    if plaintext_len != input_len {
        return Err(invalid_payload(
            input_path,
            "package changed while it was being encrypted",
        ));
    }

    let table_bytes = serialize_chunk_table(&table_entries);
    writer.write_all(&table_bytes).map_err(write_error)?;

    let footer = EmbeddedChunkedPayloadFooter {
        version: CHUNKED_FOOTER_VERSION,
        encrypted_offset: 0,
        encrypted_len,
        table_offset: encrypted_len,
        table_len: table_bytes.len() as u64,
        plaintext_len,
        chunk_size: chunk_size as u64,
        segment_count: table_entries.len() as u64,
        nonce,
        key_envelope: wrap_payload_key(&[], key, nonce),
    };
    writer
        .write_all(&serialize_chunked_footer(&footer))
        .map_err(write_error)?;
    writer
        .into_inner()
        .map_err(|error| write_error(error.into_error()))?
        .sync_all()
        .map_err(write_error)?;

    Ok(AppendChunkedPayloadOutcome {
        output_path: output_path.to_path_buf(),
        footer,
    })
}

fn read_until_full(reader: &mut impl Read, buffer: &mut [u8]) -> std::io::Result<usize> {
    let mut filled = 0;
    while filled < buffer.len() {
        match reader.read(&mut buffer[filled..]) {
            Ok(0) => break,
            Ok(read) => filled += read,
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => {}
            Err(error) => return Err(error),
        }
    }
    Ok(filled)
}

/// Random-access reader for a standalone chunked payload that occupies
/// `[base_offset, base_offset + length)` of a file, such as an uncompressed
/// asset inside an Android APK or a macOS `routevn-package.bin`.
///
/// The footer, chunk table, and unwrapped key are parsed once. The most
/// recently decrypted segment is cached, because players read sequential
/// ranges that usually fall in the same segment.
#[derive(Debug)]
pub struct StandaloneChunkedPayloadReader {
    path: PathBuf,
    file: fs::File,
    base_offset: u64,
    footer: EmbeddedChunkedPayloadFooter,
    segments: Vec<ChunkedPayloadSegment>,
    key: PayloadKey,
    cached_segment: Option<(usize, Vec<u8>)>,
}

impl StandaloneChunkedPayloadReader {
    pub fn open(path: &Path) -> Result<Self> {
        let length = fs::metadata(path)
            .map_err(|source| PackagerError::ReadFile {
                path: path.to_path_buf(),
                source,
            })?
            .len();
        Self::open_range(path, 0, length)
    }

    pub fn open_range(path: &Path, base_offset: u64, length: u64) -> Result<Self> {
        let read_error = |source| PackagerError::ReadFile {
            path: path.to_path_buf(),
            source,
        };
        let mut file = fs::File::open(path).map_err(read_error)?;
        let file_len = file.metadata().map_err(read_error)?.len();
        let range_end = base_offset
            .checked_add(length)
            .filter(|end| *end <= file_len)
            .ok_or_else(|| invalid_payload(path, "payload range is outside the file"))?;

        if length < CHUNKED_FOOTER_SIZE as u64 {
            return Err(chunked_footer_too_small(path));
        }

        let footer = read_chunked_footer_ending_at(&mut file, path, range_end)?;
        if footer.encrypted_offset != 0 {
            return Err(invalid_payload(
                path,
                "standalone payload must start with its first segment",
            ));
        }
        validate_chunked_footer_ranges(path, &footer, length)?;

        let table_bytes = read_open_file_range(
            &mut file,
            path,
            base_offset + footer.table_offset,
            footer.table_len,
        )?;
        let segments = chunked_segments_from_table(path, &footer, &table_bytes)?;
        let key = PayloadKey(xor_key_with_mask(
            footer.key_envelope,
            derive_key_mask(&[], footer.nonce),
        ));

        Ok(Self {
            path: path.to_path_buf(),
            file,
            base_offset,
            footer,
            segments,
            key,
            cached_segment: None,
        })
    }

    pub fn metadata(&self) -> EmbeddedPayloadMetadata {
        EmbeddedPayloadMetadata {
            plaintext_len: self.footer.plaintext_len,
            chunk_size: self.footer.chunk_size,
            segment_count: self.footer.segment_count,
        }
    }

    pub fn plaintext_len(&self) -> u64 {
        self.footer.plaintext_len
    }

    /// Copies plaintext starting at `position` into `buffer` and returns the
    /// number of bytes copied. Returns 0 at or past the end of the payload.
    pub fn read_at(&mut self, position: u64, buffer: &mut [u8]) -> Result<usize> {
        let mut copied = 0usize;
        let mut cursor = position;

        while copied < buffer.len() && cursor < self.footer.plaintext_len {
            let segment_index = self.segments.partition_point(|segment| {
                segment.plaintext_offset + segment.plaintext_len <= cursor
            });
            let segment = self.segments[segment_index];
            let plaintext = self.decrypted_segment(segment_index)?;
            let segment_start = (cursor - segment.plaintext_offset) as usize;
            let count = (plaintext.len() - segment_start).min(buffer.len() - copied);
            buffer[copied..copied + count]
                .copy_from_slice(&plaintext[segment_start..segment_start + count]);
            copied += count;
            cursor += count as u64;
        }

        Ok(copied)
    }

    fn decrypted_segment(&mut self, segment_index: usize) -> Result<&[u8]> {
        let cached = matches!(&self.cached_segment, Some((index, _)) if *index == segment_index);
        if !cached {
            let segment = self.segments[segment_index];
            let encrypted_segment = read_open_file_range(
                &mut self.file,
                &self.path,
                self.base_offset + segment.encrypted_offset,
                segment.encrypted_len,
            )?;
            let plaintext = decrypt_payload(
                &encrypted_segment,
                self.key,
                derive_segment_nonce(self.footer.nonce, segment_index as u64),
            )?;
            if plaintext.len() as u64 != segment.plaintext_len {
                return Err(invalid_payload(
                    &self.path,
                    "decrypted segment length does not match payload table",
                ));
            }
            self.cached_segment = Some((segment_index, plaintext));
        }

        Ok(self
            .cached_segment
            .as_ref()
            .map(|(_, plaintext)| plaintext.as_slice())
            .unwrap_or_default())
    }
}

fn read_open_file_range(
    file: &mut fs::File,
    path: &Path,
    offset: u64,
    length: u64,
) -> Result<Vec<u8>> {
    let read_error = |source| PackagerError::ReadFile {
        path: path.to_path_buf(),
        source,
    };
    let length = usize::try_from(length)
        .map_err(|_| invalid_payload(path, "requested range does not fit this platform"))?;
    file.seek(SeekFrom::Start(offset)).map_err(read_error)?;
    let mut bytes = vec![0u8; length];
    file.read_exact(&mut bytes).map_err(read_error)?;
    Ok(bytes)
}

pub fn read_embedded_payload(exe_path: &Path, key: PayloadKey) -> Result<Vec<u8>> {
    let bytes = fs::read(exe_path).map_err(|source| PackagerError::ReadFile {
        path: exe_path.to_path_buf(),
        source,
    })?;

    if bytes.len() < FOOTER_SIZE {
        return Err(invalid_payload(
            exe_path,
            "file is smaller than the RouteVN payload footer",
        ));
    }

    let footer_start = bytes.len() - FOOTER_SIZE;
    let footer = parse_footer(exe_path, &bytes[footer_start..])?;
    let encrypted_start = usize::try_from(footer.encrypted_offset)
        .map_err(|_| invalid_payload(exe_path, "payload offset does not fit this platform"))?;
    let encrypted_len = usize::try_from(footer.encrypted_len)
        .map_err(|_| invalid_payload(exe_path, "payload length does not fit this platform"))?;
    let encrypted_end = encrypted_start
        .checked_add(encrypted_len)
        .ok_or_else(|| invalid_payload(exe_path, "payload range overflows"))?;

    if encrypted_end > footer_start {
        return Err(invalid_payload(
            exe_path,
            "payload range extends beyond footer boundary",
        ));
    }

    let payload = decrypt_payload(&bytes[encrypted_start..encrypted_end], key, footer.nonce)?;
    if payload.len() as u64 != footer.plaintext_len {
        return Err(invalid_payload(
            exe_path,
            "decrypted payload length does not match footer",
        ));
    }

    Ok(payload)
}

pub fn read_self_contained_embedded_payload(exe_path: &Path) -> Result<Vec<u8>> {
    let bytes = fs::read(exe_path).map_err(|source| PackagerError::ReadFile {
        path: exe_path.to_path_buf(),
        source,
    })?;

    if bytes.len() < FOOTER_SIZE {
        return Err(invalid_payload(
            exe_path,
            "file is smaller than the RouteVN payload footer",
        ));
    }

    let footer_start = bytes.len() - FOOTER_SIZE;
    let footer = parse_footer(exe_path, &bytes[footer_start..])?;
    let encrypted_start = usize::try_from(footer.encrypted_offset)
        .map_err(|_| invalid_payload(exe_path, "payload offset does not fit this platform"))?;
    if encrypted_start > footer_start {
        return Err(invalid_payload(
            exe_path,
            "payload offset extends beyond footer boundary",
        ));
    }

    let key = unwrap_payload_key(&bytes[..encrypted_start], &footer);
    read_embedded_payload(exe_path, key)
}

pub fn read_self_contained_embedded_payload_metadata(
    exe_path: &Path,
) -> Result<EmbeddedPayloadMetadata> {
    let (footer, unsigned_len) = read_chunked_footer(exe_path)?;
    validate_chunked_footer_ranges(exe_path, &footer, unsigned_len)?;

    Ok(EmbeddedPayloadMetadata {
        plaintext_len: footer.plaintext_len,
        chunk_size: footer.chunk_size,
        segment_count: footer.segment_count,
    })
}

pub fn read_self_contained_embedded_payload_range(
    exe_path: &Path,
    offset: u64,
    length: u64,
) -> Result<Vec<u8>> {
    if length == 0 {
        return Ok(Vec::new());
    }

    let (footer, unsigned_len) = read_chunked_footer(exe_path)?;
    validate_chunked_footer_ranges(exe_path, &footer, unsigned_len)?;

    if offset >= footer.plaintext_len {
        return Ok(Vec::new());
    }

    let range_end = offset.saturating_add(length).min(footer.plaintext_len);
    if range_end <= offset {
        return Ok(Vec::new());
    }

    let segments = read_chunked_segments(exe_path, &footer)?;
    let key = unwrap_chunked_payload_key_from_file(exe_path, &footer)?;
    let output_len = usize::try_from(range_end - offset)
        .map_err(|_| invalid_payload(exe_path, "requested range does not fit this platform"))?;
    let mut output = Vec::with_capacity(output_len);

    for (segment_index, segment) in segments.iter().enumerate() {
        let segment_plaintext_end = segment.plaintext_offset + segment.plaintext_len;
        if segment_plaintext_end <= offset {
            continue;
        }
        if segment.plaintext_offset >= range_end {
            break;
        }

        let encrypted_segment =
            read_file_range(exe_path, segment.encrypted_offset, segment.encrypted_len)?;
        let decrypted_segment = decrypt_payload(
            &encrypted_segment,
            key,
            derive_segment_nonce(footer.nonce, segment_index as u64),
        )?;
        if decrypted_segment.len() as u64 != segment.plaintext_len {
            return Err(invalid_payload(
                exe_path,
                "decrypted segment length does not match payload table",
            ));
        }

        let copy_start = offset.saturating_sub(segment.plaintext_offset);
        let copy_end = (range_end - segment.plaintext_offset).min(segment.plaintext_len);
        output.extend_from_slice(&decrypted_segment[copy_start as usize..copy_end as usize]);
    }

    Ok(output)
}

pub fn parse_payload_key_hex(value: &str) -> Result<PayloadKey> {
    Ok(PayloadKey(parse_fixed_hex::<KEY_SIZE>("key", value)?))
}

pub fn parse_payload_nonce_hex(value: &str) -> Result<PayloadNonce> {
    Ok(PayloadNonce(parse_fixed_hex::<NONCE_SIZE>("nonce", value)?))
}

fn serialize_footer(footer: &EmbeddedPayloadFooter) -> [u8; FOOTER_SIZE] {
    let mut bytes = [0u8; FOOTER_SIZE];
    let mut cursor = 0usize;

    bytes[cursor..cursor + FOOTER_MAGIC.len()].copy_from_slice(&FOOTER_MAGIC);
    cursor += FOOTER_MAGIC.len();
    write_u32(&mut bytes, &mut cursor, footer.version);
    write_u64(&mut bytes, &mut cursor, footer.encrypted_offset);
    write_u64(&mut bytes, &mut cursor, footer.encrypted_len);
    write_u64(&mut bytes, &mut cursor, footer.plaintext_len);
    bytes[cursor..cursor + NONCE_SIZE].copy_from_slice(&footer.nonce.0);
    cursor += NONCE_SIZE;
    bytes[cursor..cursor + KEY_SIZE].copy_from_slice(&footer.key_envelope);

    bytes
}

fn serialize_chunked_footer(footer: &EmbeddedChunkedPayloadFooter) -> [u8; CHUNKED_FOOTER_SIZE] {
    let mut bytes = [0u8; CHUNKED_FOOTER_SIZE];
    let mut cursor = 0usize;

    bytes[cursor..cursor + CHUNKED_FOOTER_MAGIC.len()].copy_from_slice(&CHUNKED_FOOTER_MAGIC);
    cursor += CHUNKED_FOOTER_MAGIC.len();
    write_u32(&mut bytes, &mut cursor, footer.version);
    write_u64(&mut bytes, &mut cursor, footer.encrypted_offset);
    write_u64(&mut bytes, &mut cursor, footer.encrypted_len);
    write_u64(&mut bytes, &mut cursor, footer.table_offset);
    write_u64(&mut bytes, &mut cursor, footer.table_len);
    write_u64(&mut bytes, &mut cursor, footer.plaintext_len);
    write_u64(&mut bytes, &mut cursor, footer.chunk_size);
    write_u64(&mut bytes, &mut cursor, footer.segment_count);
    bytes[cursor..cursor + NONCE_SIZE].copy_from_slice(&footer.nonce.0);
    cursor += NONCE_SIZE;
    bytes[cursor..cursor + KEY_SIZE].copy_from_slice(&footer.key_envelope);

    bytes
}

fn serialize_chunk_table(entries: &[ChunkedPayloadTableEntry]) -> Vec<u8> {
    let mut bytes = vec![0u8; entries.len() * CHUNK_TABLE_ENTRY_SIZE];
    let mut cursor = 0usize;

    for entry in entries {
        write_u64(&mut bytes, &mut cursor, entry.plaintext_len);
        write_u64(&mut bytes, &mut cursor, entry.encrypted_len);
    }

    bytes
}

fn parse_footer(path: &Path, bytes: &[u8]) -> Result<EmbeddedPayloadFooter> {
    if bytes.len() != FOOTER_SIZE {
        return Err(invalid_payload(path, "invalid footer size"));
    }

    let mut cursor = 0usize;
    if bytes[cursor..cursor + FOOTER_MAGIC.len()] != FOOTER_MAGIC {
        return Err(invalid_payload(path, "missing RouteVN payload footer"));
    }
    cursor += FOOTER_MAGIC.len();

    let version = read_u32(bytes, &mut cursor);
    if version != FOOTER_VERSION {
        return Err(invalid_payload(path, "unsupported payload footer version"));
    }

    let encrypted_offset = read_u64(bytes, &mut cursor);
    let encrypted_len = read_u64(bytes, &mut cursor);
    let plaintext_len = read_u64(bytes, &mut cursor);
    let mut nonce = [0u8; NONCE_SIZE];
    nonce.copy_from_slice(&bytes[cursor..cursor + NONCE_SIZE]);
    cursor += NONCE_SIZE;
    let mut key_envelope = [0u8; KEY_SIZE];
    key_envelope.copy_from_slice(&bytes[cursor..cursor + KEY_SIZE]);

    Ok(EmbeddedPayloadFooter {
        version,
        encrypted_offset,
        encrypted_len,
        plaintext_len,
        nonce: PayloadNonce(nonce),
        key_envelope,
    })
}

fn parse_chunked_footer(path: &Path, bytes: &[u8]) -> Result<EmbeddedChunkedPayloadFooter> {
    if bytes.len() != CHUNKED_FOOTER_SIZE {
        return Err(invalid_payload(path, "invalid chunked footer size"));
    }

    let mut cursor = 0usize;
    if bytes[cursor..cursor + CHUNKED_FOOTER_MAGIC.len()] != CHUNKED_FOOTER_MAGIC {
        return Err(invalid_payload(
            path,
            "missing RouteVN chunked payload footer",
        ));
    }
    cursor += CHUNKED_FOOTER_MAGIC.len();

    let version = read_u32(bytes, &mut cursor);
    if version != CHUNKED_FOOTER_VERSION {
        return Err(invalid_payload(
            path,
            "unsupported chunked payload footer version",
        ));
    }

    let encrypted_offset = read_u64(bytes, &mut cursor);
    let encrypted_len = read_u64(bytes, &mut cursor);
    let table_offset = read_u64(bytes, &mut cursor);
    let table_len = read_u64(bytes, &mut cursor);
    let plaintext_len = read_u64(bytes, &mut cursor);
    let chunk_size = read_u64(bytes, &mut cursor);
    let segment_count = read_u64(bytes, &mut cursor);
    let mut nonce = [0u8; NONCE_SIZE];
    nonce.copy_from_slice(&bytes[cursor..cursor + NONCE_SIZE]);
    cursor += NONCE_SIZE;
    let mut key_envelope = [0u8; KEY_SIZE];
    key_envelope.copy_from_slice(&bytes[cursor..cursor + KEY_SIZE]);

    Ok(EmbeddedChunkedPayloadFooter {
        version,
        encrypted_offset,
        encrypted_len,
        table_offset,
        table_len,
        plaintext_len,
        chunk_size,
        segment_count,
        nonce: PayloadNonce(nonce),
        key_envelope,
    })
}

fn parse_chunk_table(path: &Path, bytes: &[u8]) -> Result<Vec<ChunkedPayloadTableEntry>> {
    if bytes.len() % CHUNK_TABLE_ENTRY_SIZE != 0 {
        return Err(invalid_payload(path, "invalid chunk table size"));
    }

    let mut cursor = 0usize;
    let mut entries = Vec::with_capacity(bytes.len() / CHUNK_TABLE_ENTRY_SIZE);
    while cursor < bytes.len() {
        entries.push(ChunkedPayloadTableEntry {
            plaintext_len: read_u64(bytes, &mut cursor),
            encrypted_len: read_u64(bytes, &mut cursor),
        });
    }

    Ok(entries)
}

fn read_chunked_footer(path: &Path) -> Result<(EmbeddedChunkedPayloadFooter, u64)> {
    let read_error = |source| PackagerError::ReadFile {
        path: path.to_path_buf(),
        source,
    };
    let mut file = fs::File::open(path).map_err(read_error)?;
    let file_len = file.metadata().map_err(read_error)?.len();

    if file_len < CHUNKED_FOOTER_SIZE as u64 {
        return Err(chunked_footer_too_small(path));
    }

    let mut header = vec![0u8; file_len.min(PE_HEADER_WINDOW as u64) as usize];
    file.read_exact(&mut header).map_err(read_error)?;
    // A signed executable has its certificate table after the footer, separated
    // by the padding that aligns the table. Removing the signature can leave
    // that padding behind, and the headers can also describe a table that is
    // not there, so the end of the file is always tried too.
    let mut candidate_ends = Vec::new();
    if let Some(table_offset) = authenticode::certificate_table_offset(&header, file_len) {
        candidate_ends.extend(padded_ends(table_offset));
    }
    candidate_ends.extend(padded_ends(file_len));

    let mut first_result = None;
    for end in candidate_ends {
        let result = read_chunked_footer_ending_at(&mut file, path, end);
        if let Ok(footer) = &result
            && chunk_table_ends_at_footer(footer, end)
        {
            return Ok((result?, end));
        }
        first_result.get_or_insert(result.map(|footer| (footer, end)));
    }

    first_result.unwrap_or_else(|| Err(chunked_footer_too_small(path)))
}

fn padded_ends(end: u64) -> impl Iterator<Item = u64> {
    (0..authenticode::CERTIFICATE_TABLE_ALIGNMENT)
        .filter_map(move |padding| end.checked_sub(padding))
}

fn read_chunked_footer_ending_at(
    file: &mut fs::File,
    path: &Path,
    end: u64,
) -> Result<EmbeddedChunkedPayloadFooter> {
    let read_error = |source| PackagerError::ReadFile {
        path: path.to_path_buf(),
        source,
    };
    let footer_start = end
        .checked_sub(CHUNKED_FOOTER_SIZE as u64)
        .ok_or_else(|| chunked_footer_too_small(path))?;

    file.seek(SeekFrom::Start(footer_start))
        .map_err(read_error)?;
    let mut footer_bytes = [0u8; CHUNKED_FOOTER_SIZE];
    file.read_exact(&mut footer_bytes).map_err(read_error)?;

    parse_chunked_footer(path, &footer_bytes)
}

fn chunked_footer_too_small(path: &Path) -> PackagerError {
    invalid_payload(
        path,
        "file is smaller than the RouteVN chunked payload footer",
    )
}

fn chunk_table_ends_at_footer(footer: &EmbeddedChunkedPayloadFooter, unsigned_len: u64) -> bool {
    footer
        .table_offset
        .checked_add(footer.table_len)
        .and_then(|table_end| table_end.checked_add(CHUNKED_FOOTER_SIZE as u64))
        == Some(unsigned_len)
}

fn validate_chunked_footer_ranges(
    path: &Path,
    footer: &EmbeddedChunkedPayloadFooter,
    unsigned_len: u64,
) -> Result<()> {
    if footer.chunk_size == 0 {
        return Err(invalid_payload(
            path,
            "chunk size must be greater than zero",
        ));
    }

    let expected_table_len = footer
        .segment_count
        .checked_mul(CHUNK_TABLE_ENTRY_SIZE as u64)
        .ok_or_else(|| invalid_payload(path, "chunk table length overflows"))?;
    if footer.table_len != expected_table_len {
        return Err(invalid_payload(
            path,
            "chunk table length does not match segment count",
        ));
    }

    let encrypted_end = footer
        .encrypted_offset
        .checked_add(footer.encrypted_len)
        .ok_or_else(|| invalid_payload(path, "encrypted payload range overflows"))?;
    if encrypted_end != footer.table_offset {
        return Err(invalid_payload(
            path,
            "encrypted payload range does not end at chunk table",
        ));
    }

    footer
        .table_offset
        .checked_add(footer.table_len)
        .ok_or_else(|| invalid_payload(path, "chunk table range overflows"))?;
    if !chunk_table_ends_at_footer(footer, unsigned_len) {
        return Err(invalid_payload(
            path,
            "chunk table range does not end at footer boundary",
        ));
    }

    Ok(())
}

fn read_chunked_segments(
    path: &Path,
    footer: &EmbeddedChunkedPayloadFooter,
) -> Result<Vec<ChunkedPayloadSegment>> {
    let table_bytes = read_file_range(path, footer.table_offset, footer.table_len)?;
    chunked_segments_from_table(path, footer, &table_bytes)
}

fn chunked_segments_from_table(
    path: &Path,
    footer: &EmbeddedChunkedPayloadFooter,
    table_bytes: &[u8],
) -> Result<Vec<ChunkedPayloadSegment>> {
    let table_entries = parse_chunk_table(path, table_bytes)?;
    if table_entries.len() as u64 != footer.segment_count {
        return Err(invalid_payload(
            path,
            "chunk table entry count does not match footer",
        ));
    }

    let mut plaintext_offset = 0u64;
    let mut encrypted_offset = footer.encrypted_offset;
    let mut segments = Vec::with_capacity(table_entries.len());

    for entry in table_entries {
        segments.push(ChunkedPayloadSegment {
            plaintext_offset,
            plaintext_len: entry.plaintext_len,
            encrypted_offset,
            encrypted_len: entry.encrypted_len,
        });
        plaintext_offset = plaintext_offset
            .checked_add(entry.plaintext_len)
            .ok_or_else(|| invalid_payload(path, "plaintext segment offsets overflow"))?;
        encrypted_offset = encrypted_offset
            .checked_add(entry.encrypted_len)
            .ok_or_else(|| invalid_payload(path, "encrypted segment offsets overflow"))?;
    }

    if plaintext_offset != footer.plaintext_len {
        return Err(invalid_payload(
            path,
            "chunk table plaintext length does not match footer",
        ));
    }
    if encrypted_offset != footer.table_offset {
        return Err(invalid_payload(
            path,
            "chunk table encrypted length does not match footer",
        ));
    }

    Ok(segments)
}

fn read_file_range(path: &Path, offset: u64, length: u64) -> Result<Vec<u8>> {
    let length = usize::try_from(length)
        .map_err(|_| invalid_payload(path, "requested range does not fit this platform"))?;
    let mut file = fs::File::open(path).map_err(|source| PackagerError::ReadFile {
        path: path.to_path_buf(),
        source,
    })?;
    file.seek(SeekFrom::Start(offset))
        .map_err(|source| PackagerError::ReadFile {
            path: path.to_path_buf(),
            source,
        })?;
    let mut bytes = vec![0u8; length];
    file.read_exact(&mut bytes)
        .map_err(|source| PackagerError::ReadFile {
            path: path.to_path_buf(),
            source,
        })?;

    Ok(bytes)
}

fn write_u32(bytes: &mut [u8], cursor: &mut usize, value: u32) {
    bytes[*cursor..*cursor + 4].copy_from_slice(&value.to_le_bytes());
    *cursor += 4;
}

fn write_u64(bytes: &mut [u8], cursor: &mut usize, value: u64) {
    bytes[*cursor..*cursor + 8].copy_from_slice(&value.to_le_bytes());
    *cursor += 8;
}

fn read_u32(bytes: &[u8], cursor: &mut usize) -> u32 {
    let mut value = [0u8; 4];
    value.copy_from_slice(&bytes[*cursor..*cursor + 4]);
    *cursor += 4;
    u32::from_le_bytes(value)
}

fn read_u64(bytes: &[u8], cursor: &mut usize) -> u64 {
    let mut value = [0u8; 8];
    value.copy_from_slice(&bytes[*cursor..*cursor + 8]);
    *cursor += 8;
    u64::from_le_bytes(value)
}

fn invalid_payload(path: &Path, message: &str) -> PackagerError {
    PackagerError::InvalidEmbeddedPayload {
        path: path.to_path_buf(),
        message: message.to_string(),
    }
}

fn wrap_payload_key(template_bytes: &[u8], key: PayloadKey, nonce: PayloadNonce) -> [u8; KEY_SIZE] {
    xor_key_with_mask(key.0, derive_key_mask(template_bytes, nonce))
}

fn unwrap_payload_key(template_bytes: &[u8], footer: &EmbeddedPayloadFooter) -> PayloadKey {
    PayloadKey(xor_key_with_mask(
        footer.key_envelope,
        derive_key_mask(template_bytes, footer.nonce),
    ))
}

fn unwrap_chunked_payload_key_from_file(
    path: &Path,
    footer: &EmbeddedChunkedPayloadFooter,
) -> Result<PayloadKey> {
    Ok(PayloadKey(xor_key_with_mask(
        footer.key_envelope,
        derive_key_mask_from_file(path, footer.encrypted_offset, footer.nonce)?,
    )))
}

fn derive_key_mask(template_bytes: &[u8], nonce: PayloadNonce) -> [u8; KEY_SIZE] {
    let mut hasher = KeyMaskHasher::new(nonce, template_bytes.len() as u64);
    for chunk in template_bytes.chunks(PE_HEADER_WINDOW) {
        hasher.update(chunk);
    }

    hasher.finalize()
}

fn derive_key_mask_from_file(
    path: &Path,
    template_len: u64,
    nonce: PayloadNonce,
) -> Result<[u8; KEY_SIZE]> {
    let mut file = fs::File::open(path).map_err(|source| PackagerError::ReadFile {
        path: path.to_path_buf(),
        source,
    })?;
    let mut hasher = KeyMaskHasher::new(nonce, template_len);
    let mut remaining = template_len;
    let mut buffer = [0u8; PE_HEADER_WINDOW];

    while remaining > 0 {
        let read_len = remaining.min(buffer.len() as u64) as usize;
        file.read_exact(&mut buffer[..read_len])
            .map_err(|source| PackagerError::ReadFile {
                path: path.to_path_buf(),
                source,
            })?;
        hasher.update(&buffer[..read_len]);
        remaining -= read_len as u64;
    }

    Ok(hasher.finalize())
}

/// Hashes the executable the payload was appended to. The template is fed in
/// `PE_HEADER_WINDOW` chunks so the first one holds the PE headers; the
/// checksum and certificate-table entry are hashed as zero because signing the
/// finished export rewrites them.
struct KeyMaskHasher {
    hasher: Sha256,
    hashed_len: u64,
}

impl KeyMaskHasher {
    fn new(nonce: PayloadNonce, template_len: u64) -> Self {
        let mut hasher = Sha256::new();
        hasher.update(KEY_MASK_LABEL);
        hasher.update(nonce.0);
        hasher.update(template_len.to_le_bytes());

        Self {
            hasher,
            hashed_len: 0,
        }
    }

    fn update(&mut self, chunk: &[u8]) {
        let signature_fields: Option<SignatureFields> = if self.hashed_len == 0 {
            authenticode::signature_fields(chunk)
        } else {
            None
        };

        if let Some(fields) = signature_fields {
            let mut masked_chunk = chunk.to_vec();
            fields.zero(&mut masked_chunk);
            self.hasher.update(&masked_chunk);
        } else {
            self.hasher.update(chunk);
        }
        self.hashed_len += chunk.len() as u64;
    }

    fn finalize(self) -> [u8; KEY_SIZE] {
        self.hasher.finalize().into()
    }
}

fn derive_segment_nonce(seed: PayloadNonce, segment_index: u64) -> PayloadNonce {
    let mut hasher = Sha256::new();
    hasher.update(SEGMENT_NONCE_LABEL);
    hasher.update(seed.0);
    hasher.update(segment_index.to_le_bytes());
    let digest = hasher.finalize();
    let mut nonce = [0u8; NONCE_SIZE];
    nonce.copy_from_slice(&digest[..NONCE_SIZE]);

    PayloadNonce(nonce)
}

fn xor_key_with_mask(mut key: [u8; KEY_SIZE], mask: [u8; KEY_SIZE]) -> [u8; KEY_SIZE] {
    for (key_byte, mask_byte) in key.iter_mut().zip(mask) {
        *key_byte ^= mask_byte;
    }

    key
}

fn parse_fixed_hex<const N: usize>(field: &str, value: &str) -> Result<[u8; N]> {
    if value.len() != N * 2 {
        return Err(PackagerError::InvalidHexValue {
            field: field.to_string(),
            expected_bytes: N,
        });
    }

    let mut bytes = [0u8; N];
    for (index, byte) in bytes.iter_mut().enumerate() {
        let start = index * 2;
        let end = start + 2;
        *byte = u8::from_str_radix(&value[start..end], 16).map_err(|_| {
            PackagerError::InvalidHexValue {
                field: field.to_string(),
                expected_bytes: N,
            }
        })?;
    }

    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use sha2::{Digest, Sha256};
    use tempfile::tempdir;

    use super::{
        AppendChunkedPayloadRequest, AppendPayloadRequest, PayloadKey, PayloadNonce,
        StandaloneChunkedPayloadReader, WriteStandaloneChunkedPayloadFromFileRequest,
        WriteStandaloneChunkedPayloadRequest, append_chunked_encrypted_payload,
        append_encrypted_payload, generate_payload_key_material, parse_payload_key_hex,
        parse_payload_nonce_hex, read_embedded_payload, read_self_contained_embedded_payload,
        read_self_contained_embedded_payload_metadata, read_self_contained_embedded_payload_range,
        write_standalone_chunked_encrypted_payload,
        write_standalone_chunked_encrypted_payload_from_file,
    };

    fn patterned_bytes(length: usize) -> Vec<u8> {
        (0..length)
            .map(|index| (index.wrapping_mul(31) ^ (index >> 7)) as u8)
            .collect()
    }

    #[test]
    fn streamed_standalone_payload_matches_in_memory_writer() {
        let temp = tempdir().unwrap();
        let chunk_size = 64;
        for length in [0, 1, 63, 64, 65, 224] {
            let plaintext = patterned_bytes(length);
            let input_path = temp.path().join(format!("package-{length}.bin"));
            let memory_path = temp.path().join(format!("memory-{length}.bin"));
            let streamed_path = temp.path().join(format!("streamed-{length}.bin"));
            std::fs::write(&input_path, &plaintext).unwrap();

            write_standalone_chunked_encrypted_payload(WriteStandaloneChunkedPayloadRequest {
                output_path: &memory_path,
                payload: &plaintext,
                key: fixture_key(),
                nonce: fixture_nonce(),
                chunk_size,
            })
            .unwrap();
            let mut progress = Vec::new();
            write_standalone_chunked_encrypted_payload_from_file(
                WriteStandaloneChunkedPayloadFromFileRequest {
                    input_path: &input_path,
                    output_path: &streamed_path,
                    key: fixture_key(),
                    nonce: fixture_nonce(),
                    chunk_size,
                },
                |done, total| progress.push((done, total)),
            )
            .unwrap();

            assert_eq!(
                std::fs::read(&streamed_path).unwrap(),
                std::fs::read(&memory_path).unwrap(),
                "length {length}"
            );
            if length > 0 {
                assert_eq!(progress.last(), Some(&(length as u64, length as u64)));
            }
            let mut reader = StandaloneChunkedPayloadReader::open(&streamed_path).unwrap();
            let mut decrypted = vec![0u8; length];
            assert_eq!(reader.read_at(0, &mut decrypted).unwrap(), length);
            assert_eq!(decrypted, plaintext);
        }
    }

    #[test]
    fn standalone_reader_reads_payload_inside_a_larger_file() {
        let temp = tempdir().unwrap();
        let plaintext = patterned_bytes(1000);
        let payload_path = temp.path().join("payload.bin");
        write_standalone_chunked_encrypted_payload(WriteStandaloneChunkedPayloadRequest {
            output_path: &payload_path,
            payload: &plaintext,
            key: fixture_key(),
            nonce: fixture_nonce(),
            chunk_size: 128,
        })
        .unwrap();
        let payload_bytes = std::fs::read(&payload_path).unwrap();

        let container_path = temp.path().join("container.apk");
        let prefix = vec![0xAB; 333];
        let suffix = vec![0xCD; 77];
        let mut container = prefix.clone();
        container.extend_from_slice(&payload_bytes);
        container.extend_from_slice(&suffix);
        std::fs::write(&container_path, &container).unwrap();

        let mut reader = StandaloneChunkedPayloadReader::open_range(
            &container_path,
            prefix.len() as u64,
            payload_bytes.len() as u64,
        )
        .unwrap();
        assert_eq!(reader.plaintext_len(), plaintext.len() as u64);
        assert_eq!(reader.metadata().segment_count, 8);

        let mut whole = vec![0u8; plaintext.len() + 10];
        assert_eq!(reader.read_at(0, &mut whole).unwrap(), plaintext.len());
        assert_eq!(&whole[..plaintext.len()], plaintext.as_slice());

        for (start, length) in [(0, 1), (127, 2), (128, 128), (500, 333), (999, 5)] {
            let mut buffer = vec![0u8; length];
            let copied = reader.read_at(start as u64, &mut buffer).unwrap();
            let expected_end = (start + length).min(plaintext.len());
            assert_eq!(copied, expected_end - start);
            assert_eq!(&buffer[..copied], &plaintext[start..expected_end]);
        }

        let mut past_end = [0u8; 4];
        assert_eq!(reader.read_at(1000, &mut past_end).unwrap(), 0);

        let mut direct = StandaloneChunkedPayloadReader::open(&payload_path).unwrap();
        let mut direct_bytes = vec![0u8; plaintext.len()];
        assert_eq!(
            direct.read_at(0, &mut direct_bytes).unwrap(),
            plaintext.len()
        );
        assert_eq!(direct_bytes, plaintext);
    }

    #[test]
    fn standalone_reader_rejects_tampered_segments() {
        let temp = tempdir().unwrap();
        let plaintext = patterned_bytes(300);
        let payload_path = temp.path().join("payload.bin");
        write_standalone_chunked_encrypted_payload(WriteStandaloneChunkedPayloadRequest {
            output_path: &payload_path,
            payload: &plaintext,
            key: fixture_key(),
            nonce: fixture_nonce(),
            chunk_size: 100,
        })
        .unwrap();
        let mut bytes = std::fs::read(&payload_path).unwrap();
        bytes[150] ^= 0x01;
        std::fs::write(&payload_path, &bytes).unwrap();

        let mut reader = StandaloneChunkedPayloadReader::open(&payload_path).unwrap();
        let mut first = vec![0u8; 50];
        assert_eq!(reader.read_at(0, &mut first).unwrap(), 50);
        let mut second = vec![0u8; 50];
        assert!(reader.read_at(150, &mut second).is_err());
    }

    fn fixture_key() -> PayloadKey {
        PayloadKey([0x42; 32])
    }

    fn fixture_nonce() -> PayloadNonce {
        PayloadNonce([0x24; 24])
    }

    #[test]
    fn appends_and_reads_encrypted_payload() {
        let temp = tempdir().unwrap();
        let template_path = temp.path().join("template.exe");
        let output_path = temp.path().join("My Game.exe");
        let template_bytes = b"fake executable bytes";
        let payload = b"package.bin bytes with asset data";

        std::fs::write(&template_path, template_bytes).unwrap();
        let outcome = append_encrypted_payload(AppendPayloadRequest {
            template_path: &template_path,
            output_path: &output_path,
            payload,
            key: fixture_key(),
            nonce: fixture_nonce(),
        })
        .unwrap();

        assert_eq!(outcome.footer.encrypted_offset, template_bytes.len() as u64);
        assert_eq!(outcome.footer.plaintext_len, payload.len() as u64);

        let output_bytes = std::fs::read(&output_path).unwrap();
        assert!(output_bytes.starts_with(template_bytes));
        assert!(
            !output_bytes
                .windows(payload.len())
                .any(|window| window == payload)
        );

        let decoded = read_embedded_payload(&output_path, fixture_key()).unwrap();
        assert_eq!(decoded, payload);
        let self_contained_decoded = read_self_contained_embedded_payload(&output_path).unwrap();
        assert_eq!(self_contained_decoded, payload);
    }

    #[test]
    fn rejects_wrong_key() {
        let temp = tempdir().unwrap();
        let template_path = temp.path().join("template.exe");
        let output_path = temp.path().join("My Game.exe");

        std::fs::write(&template_path, b"fake executable bytes").unwrap();
        append_encrypted_payload(AppendPayloadRequest {
            template_path: &template_path,
            output_path: &output_path,
            payload: b"payload",
            key: fixture_key(),
            nonce: fixture_nonce(),
        })
        .unwrap();

        let error = read_embedded_payload(&output_path, PayloadKey([0x11; 32])).unwrap_err();
        assert!(error.to_string().contains("failed to decrypt payload"));
    }

    #[test]
    fn parses_payload_key_and_nonce_hex() {
        let key = parse_payload_key_hex(
            "4242424242424242424242424242424242424242424242424242424242424242",
        )
        .unwrap();
        let nonce =
            parse_payload_nonce_hex("242424242424242424242424242424242424242424242424").unwrap();

        assert_eq!(key, fixture_key());
        assert_eq!(nonce, fixture_nonce());
    }

    #[test]
    fn generated_key_material_can_roundtrip_self_contained_payload() {
        let temp = tempdir().unwrap();
        let template_path = temp.path().join("template.exe");
        let output_path = temp.path().join("generated.exe");
        let payload = b"generated-key package.bin bytes";
        let (key, nonce) = generate_payload_key_material();

        std::fs::write(&template_path, b"fake executable bytes").unwrap();
        append_encrypted_payload(AppendPayloadRequest {
            template_path: &template_path,
            output_path: &output_path,
            payload,
            key,
            nonce,
        })
        .unwrap();

        let decoded = read_self_contained_embedded_payload(&output_path).unwrap();
        assert_eq!(decoded, payload);
    }

    #[test]
    fn appends_and_reads_chunked_encrypted_payload_ranges() {
        let temp = tempdir().unwrap();
        let template_path = temp.path().join("template.exe");
        let output_path = temp.path().join("My Game.exe");
        let template_bytes = b"fake executable bytes";
        let payload = b"abcdefghijklmnopqrstuvwxyz0123456789";

        std::fs::write(&template_path, template_bytes).unwrap();
        let outcome = append_chunked_encrypted_payload(AppendChunkedPayloadRequest {
            template_path: &template_path,
            output_path: &output_path,
            payload,
            key: fixture_key(),
            nonce: fixture_nonce(),
            chunk_size: 8,
        })
        .unwrap();

        assert_eq!(outcome.footer.encrypted_offset, template_bytes.len() as u64);
        assert_eq!(outcome.footer.plaintext_len, payload.len() as u64);
        assert_eq!(outcome.footer.chunk_size, 8);
        assert_eq!(outcome.footer.segment_count, 5);

        let output_bytes = std::fs::read(&output_path).unwrap();
        assert_eq!(
            format!("{:x}", Sha256::digest(&output_bytes)),
            "f3e98a011d95068e3f067f4b19f0aa68e114cb8617aa2e44642bb4b54632f3f4",
            "the Windows appended payload fixture must remain byte-for-byte compatible",
        );
        assert!(output_bytes.starts_with(template_bytes));
        assert!(
            !output_bytes
                .windows(payload.len())
                .any(|window| window == payload)
        );

        let metadata = read_self_contained_embedded_payload_metadata(&output_path).unwrap();
        assert_eq!(metadata.plaintext_len, payload.len() as u64);
        assert_eq!(metadata.chunk_size, 8);
        assert_eq!(metadata.segment_count, 5);

        let first_range = read_self_contained_embedded_payload_range(&output_path, 0, 5).unwrap();
        assert_eq!(first_range, b"abcde");

        let boundary_range =
            read_self_contained_embedded_payload_range(&output_path, 6, 12).unwrap();
        assert_eq!(boundary_range, b"ghijklmnopqr");

        let clamped_range =
            read_self_contained_embedded_payload_range(&output_path, 30, 100).unwrap();
        assert_eq!(clamped_range, &payload[30..]);

        let empty_range =
            read_self_contained_embedded_payload_range(&output_path, 999, 10).unwrap();
        assert!(empty_range.is_empty());
    }

    #[test]
    fn writes_and_reads_standalone_chunked_encrypted_payload_ranges() {
        let temp = tempdir().unwrap();
        let output_path = temp.path().join("routevn-package.bin");
        let payload = b"standalone package.bin bytes across chunk boundaries";

        let outcome =
            write_standalone_chunked_encrypted_payload(WriteStandaloneChunkedPayloadRequest {
                output_path: &output_path,
                payload,
                key: fixture_key(),
                nonce: fixture_nonce(),
                chunk_size: 11,
            })
            .unwrap();

        assert_eq!(outcome.footer.encrypted_offset, 0);
        assert_eq!(outcome.footer.plaintext_len, payload.len() as u64);
        assert_eq!(outcome.footer.segment_count, 5);

        let output_bytes = std::fs::read(&output_path).unwrap();
        assert!(
            !output_bytes
                .windows(payload.len())
                .any(|window| window == payload)
        );

        let metadata = read_self_contained_embedded_payload_metadata(&output_path).unwrap();
        assert_eq!(metadata.plaintext_len, payload.len() as u64);
        assert_eq!(metadata.chunk_size, 11);
        assert_eq!(metadata.segment_count, 5);

        let range = read_self_contained_embedded_payload_range(&output_path, 8, 29).unwrap();
        assert_eq!(range, &payload[8..37]);
    }
}
