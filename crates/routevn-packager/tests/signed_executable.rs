use std::fs;
use std::path::{Path, PathBuf};

use routevn_packager::payload::{
    read_self_contained_embedded_payload_metadata, read_self_contained_embedded_payload_range,
};
use routevn_packager::run_with_args;
use sha2::{Digest, Sha256};

mod common;

use common::{PNG_64, minimal_pe, write_u32};

const KEY: [u8; 32] = [0x42; 32];
const NONCE: [u8; 24] = [0x24; 24];

// Offsets into `minimal_pe`: the optional header starts at 0x98, the checksum
// is 64 bytes into it and the certificate table is data directory entry 4.
const CHECKSUM_OFFSET: usize = 0x98 + 64;
const CERTIFICATE_ENTRY_OFFSET: usize = 0x98 + 112 + 4 * 8;
const TEMPLATE_BYTE_OUTSIDE_SIGNATURE_FIELDS: usize = 0x200;

struct Export {
    directory: tempfile::TempDir,
    payload: Vec<u8>,
}

impl Export {
    fn create(payload_len: usize) -> Self {
        let directory = tempfile::tempdir().unwrap();
        let payload: Vec<u8> = (0..payload_len).map(|index| (index % 251) as u8).collect();
        fs::write(directory.path().join("template.exe"), minimal_pe()).unwrap();
        fs::write(directory.path().join("package.bin"), &payload).unwrap();
        fs::write(directory.path().join("icon.png"), PNG_64).unwrap();
        let root = directory.path();
        run_with_args([
            "routevn-packager".to_string(),
            "stamp-exe".to_string(),
            format!("--template={}", root.join("template.exe").display()),
            format!("--payload={}", root.join("package.bin").display()),
            format!("--out={}", root.join("Project One.exe").display()),
            "--title=Project One".to_string(),
            "--version=1.2.3".to_string(),
            "--identifier=com.example.project-one".to_string(),
            format!("--icon={}", root.join("icon.png").display()),
            format!("--key-hex={}", hex(&KEY)),
            format!("--nonce-hex={}", hex(&NONCE)),
        ])
        .unwrap();

        Self { directory, payload }
    }

    fn exe(&self) -> PathBuf {
        self.directory.path().join("Project One.exe")
    }

    fn assert_payload_reads_back(&self) {
        let metadata = read_self_contained_embedded_payload_metadata(&self.exe()).unwrap();
        assert_eq!(metadata.plaintext_len, self.payload.len() as u64);
        let restored =
            read_self_contained_embedded_payload_range(&self.exe(), 0, self.payload.len() as u64)
                .unwrap();
        assert_eq!(restored, self.payload);
    }
}

// Does to the file what Authenticode signing does: pads it to an 8-byte
// boundary, appends a WIN_CERTIFICATE after the padding, then rewrites the
// checksum and the certificate-table directory entry in the PE headers.
fn simulate_authenticode_signature(path: &Path, certificate_len: usize) {
    let mut bytes = fs::read(path).unwrap();
    bytes.resize(bytes.len().next_multiple_of(8), 0);
    let table_offset = bytes.len();

    let mut certificate = vec![0u8; 8];
    certificate[4..6].copy_from_slice(&0x0200u16.to_le_bytes());
    certificate[6..8].copy_from_slice(&0x0002u16.to_le_bytes());
    certificate.extend((0..certificate_len).map(|index| (index % 253) as u8));
    certificate.resize(certificate.len().next_multiple_of(8), 0);
    let table_len = certificate.len();
    certificate[..4].copy_from_slice(&(table_len as u32).to_le_bytes());
    bytes.extend_from_slice(&certificate);

    write_u32(&mut bytes, CHECKSUM_OFFSET, 0x00c0_ffee);
    write_u32(&mut bytes, CERTIFICATE_ENTRY_OFFSET, table_offset as u32);
    write_u32(&mut bytes, CERTIFICATE_ENTRY_OFFSET + 4, table_len as u32);
    fs::write(path, bytes).unwrap();
}

#[test]
fn reads_payload_from_signed_export_for_every_padding_length() {
    // The export length changes with the payload, so these cover each
    // remainder modulo the 8-byte alignment of the certificate table.
    let mut seen_paddings = Vec::new();
    for payload_len in 4096..4112 {
        let export = Export::create(payload_len);
        export.assert_payload_reads_back();

        let unsigned_len = fs::metadata(export.exe()).unwrap().len() as usize;
        seen_paddings.push(unsigned_len.next_multiple_of(8) - unsigned_len);
        simulate_authenticode_signature(&export.exe(), 3000);

        export.assert_payload_reads_back();
    }

    for padding in 0..8 {
        assert!(
            seen_paddings.contains(&padding),
            "no export needed {padding} bytes of certificate table padding",
        );
    }
}

#[test]
fn reads_payload_when_signature_is_replaced() {
    let export = Export::create(4096);
    simulate_authenticode_signature(&export.exe(), 3000);
    export.assert_payload_reads_back();

    // Sign again, as a timestamp or a second signature would: the certificate
    // table is rewritten larger than before.
    let signed = fs::read(export.exe()).unwrap();
    let table_offset = u32::from_le_bytes(
        signed[CERTIFICATE_ENTRY_OFFSET..CERTIFICATE_ENTRY_OFFSET + 4]
            .try_into()
            .unwrap(),
    ) as usize;
    fs::write(export.exe(), &signed[..table_offset]).unwrap();
    simulate_authenticode_signature(&export.exe(), 9000);

    export.assert_payload_reads_back();
}

#[test]
fn unsigned_export_keeps_the_key_envelope_older_players_expect() {
    let export = Export::create(4096);
    let bytes = fs::read(export.exe()).unwrap();
    let metadata = read_self_contained_embedded_payload_metadata(&export.exe()).unwrap();
    assert_eq!(metadata.segment_count, 1);

    // A stamped template has no checksum and no certificate table, so hashing
    // it as it is must give the same mask as hashing it with those fields
    // zeroed. Players that predate signing support read these exports.
    let footer_start = bytes.len() - (16 + 4 + 7 * 8 + 24 + 32);
    let encrypted_offset = u64::from_le_bytes(
        bytes[footer_start + 20..footer_start + 28]
            .try_into()
            .unwrap(),
    ) as usize;
    let mut hasher = Sha256::new();
    hasher.update(b"routevn-player-payload-key-v1");
    hasher.update(NONCE);
    hasher.update((encrypted_offset as u64).to_le_bytes());
    hasher.update(&bytes[..encrypted_offset]);
    let mask = hasher.finalize();

    let key_envelope = &bytes[bytes.len() - 32..];
    let expected: Vec<u8> = KEY.iter().zip(mask).map(|(key, mask)| key ^ mask).collect();
    assert_eq!(key_envelope, expected.as_slice());
}

#[test]
fn rejects_signed_export_with_modified_executable() {
    let export = Export::create(4096);
    simulate_authenticode_signature(&export.exe(), 3000);

    let mut bytes = fs::read(export.exe()).unwrap();
    bytes[TEMPLATE_BYTE_OUTSIDE_SIGNATURE_FIELDS] ^= 0xff;
    fs::write(export.exe(), bytes).unwrap();

    let error = read_self_contained_embedded_payload_range(&export.exe(), 0, 16).unwrap_err();
    assert!(
        error.to_string().contains("failed to decrypt payload"),
        "unexpected error: {error}"
    );
}

#[test]
fn rejects_certificate_table_outside_the_file() {
    let export = Export::create(4096);
    simulate_authenticode_signature(&export.exe(), 3000);

    let mut bytes = fs::read(export.exe()).unwrap();
    let file_len = bytes.len() as u32;
    write_u32(&mut bytes, CERTIFICATE_ENTRY_OFFSET, file_len);
    write_u32(&mut bytes, CERTIFICATE_ENTRY_OFFSET + 4, 1 << 20);
    fs::write(export.exe(), bytes).unwrap();

    let error = read_self_contained_embedded_payload_metadata(&export.exe()).unwrap_err();
    assert!(
        error.to_string().contains("footer"),
        "unexpected error: {error}"
    );
}

#[test]
fn reads_unsigned_export_with_a_certificate_entry_outside_the_file() {
    let export = Export::create(4096);
    let mut bytes = fs::read(export.exe()).unwrap();
    write_u32(&mut bytes, CERTIFICATE_ENTRY_OFFSET, 8);
    write_u32(&mut bytes, CERTIFICATE_ENTRY_OFFSET + 4, u32::MAX);
    fs::write(export.exe(), bytes).unwrap();

    export.assert_payload_reads_back();
}

#[test]
fn reads_unsigned_export_with_a_certificate_entry_pointing_inside_the_file() {
    let export = Export::create(4096);
    let mut bytes = fs::read(export.exe()).unwrap();
    write_u32(&mut bytes, CERTIFICATE_ENTRY_OFFSET, 0x400);
    write_u32(&mut bytes, CERTIFICATE_ENTRY_OFFSET + 4, 0x100);
    fs::write(export.exe(), bytes).unwrap();

    export.assert_payload_reads_back();
}

#[test]
fn reads_export_after_the_signature_is_removed() {
    // Removing a signature drops the certificate table but keeps the padding
    // that aligned it, and the headers no longer describe a table.
    for payload_len in 4096..4104 {
        let export = Export::create(payload_len);
        simulate_authenticode_signature(&export.exe(), 3000);

        let mut bytes = fs::read(export.exe()).unwrap();
        let table_offset = u32::from_le_bytes(
            bytes[CERTIFICATE_ENTRY_OFFSET..CERTIFICATE_ENTRY_OFFSET + 4]
                .try_into()
                .unwrap(),
        ) as usize;
        bytes.truncate(table_offset);
        write_u32(&mut bytes, CERTIFICATE_ENTRY_OFFSET, 0);
        write_u32(&mut bytes, CERTIFICATE_ENTRY_OFFSET + 4, 0);
        fs::write(export.exe(), bytes).unwrap();

        export.assert_payload_reads_back();
    }
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}
