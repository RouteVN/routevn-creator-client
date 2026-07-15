use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use chacha20poly1305::aead::{Aead, AeadCore, KeyInit, OsRng};
use chacha20poly1305::{Key, XChaCha20Poly1305, XNonce};
use sha2::{Digest, Sha256};

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
    let (footer, file_len) = read_chunked_footer(exe_path)?;
    validate_chunked_footer_ranges(exe_path, &footer, file_len)?;

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

    let (footer, file_len) = read_chunked_footer(exe_path)?;
    validate_chunked_footer_ranges(exe_path, &footer, file_len)?;

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
    let mut file = fs::File::open(path).map_err(|source| PackagerError::ReadFile {
        path: path.to_path_buf(),
        source,
    })?;
    let file_len = file
        .metadata()
        .map_err(|source| PackagerError::ReadFile {
            path: path.to_path_buf(),
            source,
        })?
        .len();

    if file_len < CHUNKED_FOOTER_SIZE as u64 {
        return Err(invalid_payload(
            path,
            "file is smaller than the RouteVN chunked payload footer",
        ));
    }

    file.seek(SeekFrom::End(-(CHUNKED_FOOTER_SIZE as i64)))
        .map_err(|source| PackagerError::ReadFile {
            path: path.to_path_buf(),
            source,
        })?;
    let mut footer_bytes = [0u8; CHUNKED_FOOTER_SIZE];
    file.read_exact(&mut footer_bytes)
        .map_err(|source| PackagerError::ReadFile {
            path: path.to_path_buf(),
            source,
        })?;

    Ok((parse_chunked_footer(path, &footer_bytes)?, file_len))
}

fn validate_chunked_footer_ranges(
    path: &Path,
    footer: &EmbeddedChunkedPayloadFooter,
    file_len: u64,
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

    let table_end = footer
        .table_offset
        .checked_add(footer.table_len)
        .ok_or_else(|| invalid_payload(path, "chunk table range overflows"))?;
    if table_end
        .checked_add(CHUNKED_FOOTER_SIZE as u64)
        .is_none_or(|expected_file_len| expected_file_len != file_len)
    {
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
    let table_entries = parse_chunk_table(path, &table_bytes)?;
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
    let mut hasher = create_key_mask_hasher(nonce, template_bytes.len() as u64);
    hasher.update(template_bytes);
    hasher.finalize().into()
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
    let mut hasher = create_key_mask_hasher(nonce, template_len);
    let mut remaining = template_len;
    let mut buffer = [0u8; 64 * 1024];

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

    Ok(hasher.finalize().into())
}

fn create_key_mask_hasher(nonce: PayloadNonce, template_len: u64) -> Sha256 {
    let mut hasher = Sha256::new();
    hasher.update(KEY_MASK_LABEL);
    hasher.update(nonce.0);
    hasher.update(template_len.to_le_bytes());
    hasher
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
        WriteStandaloneChunkedPayloadRequest, append_chunked_encrypted_payload,
        append_encrypted_payload, generate_payload_key_material, parse_payload_key_hex,
        parse_payload_nonce_hex, read_embedded_payload, read_self_contained_embedded_payload,
        read_self_contained_embedded_payload_metadata, read_self_contained_embedded_payload_range,
        write_standalone_chunked_encrypted_payload,
    };

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
