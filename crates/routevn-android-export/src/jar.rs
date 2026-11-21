//! JAR signing, as `jarsigner` does it. Google Play requires an uploaded
//! app bundle to be signed this way with the upload key.
//!
//! `META-INF/MANIFEST.MF` lists the SHA-256 of every other entry, the
//! signature file lists the SHA-256 of the manifest and of each of its
//! sections, and the signature block is a PKCS #7 SignedData with an
//! RSA signature of the signature file and the signing certificate.

use std::fs::File;
use std::path::Path;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use cms::cert::{CertificateChoices, IssuerAndSerialNumber};
use cms::content_info::{CmsVersion, ContentInfo};
use cms::signed_data::{
    CertificateSet, EncapsulatedContentInfo, SignedData, SignerIdentifier, SignerInfo, SignerInfos,
};
use rsa::RsaPublicKey;
use rsa::pkcs1v15::{Signature, VerifyingKey};
use rsa::pkcs8::DecodePublicKey;
use rsa::signature::Verifier;
use sha2::{Digest, Sha256};
use x509_cert::Certificate;
use x509_cert::der::asn1::{Any, ObjectIdentifier, OctetString, SetOfVec};
use x509_cert::der::{Decode, Encode, Tag};
use x509_cert::spki::AlgorithmIdentifierOwned;

use crate::error::{ErrorCode, ExportError, Result};
use crate::signing::SigningKey;
use crate::template::is_signature_entry;
use crate::zip::{self, ZipEntry};

pub const MANIFEST_ENTRY: &str = "META-INF/MANIFEST.MF";
pub const SIGNATURE_FILE_ENTRY: &str = "META-INF/UPLOAD.SF";
pub const SIGNATURE_BLOCK_ENTRY: &str = "META-INF/UPLOAD.RSA";

const CREATED_BY: &str = "RouteVN Creator";
const DIGEST_HEADER: &str = "SHA-256-Digest";
const MAX_LINE_BYTES: usize = 72;

const ID_DATA: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.7.1");
const ID_SIGNED_DATA: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.7.2");
const ID_SHA256: ObjectIdentifier = ObjectIdentifier::new_unwrap("2.16.840.1.101.3.4.2.1");
const RSA_ENCRYPTION: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.1.1");
const SHA256_WITH_RSA: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.1.11");

/// The three files that sign an archive, written first in it.
pub struct JarSignature {
    pub manifest: Vec<u8>,
    pub signature_file: Vec<u8>,
    pub signature_block: Vec<u8>,
}

impl JarSignature {
    pub fn entries(&self) -> [(&'static str, &[u8]); 3] {
        [
            (MANIFEST_ENTRY, &self.manifest),
            (SIGNATURE_FILE_ENTRY, &self.signature_file),
            (SIGNATURE_BLOCK_ENTRY, &self.signature_block),
        ]
    }
}

fn signing_error(message: impl Into<String>) -> ExportError {
    ExportError::new(ErrorCode::SigningFailed, message)
}

/// Writes `name: value`, wrapped at 72 bytes with continuation lines that
/// start with a space.
fn write_header(output: &mut Vec<u8>, name: &str, value: &str) {
    let line = format!("{name}: {value}");
    let mut rest = line.as_bytes();
    let mut limit = MAX_LINE_BYTES;
    loop {
        let (chunk, tail) = rest.split_at(rest.len().min(limit));
        output.extend_from_slice(chunk);
        output.extend_from_slice(b"\r\n");
        rest = tail;
        if rest.is_empty() {
            break;
        }
        output.push(b' ');
        limit = MAX_LINE_BYTES - 1;
    }
}

fn digest_section(name: &str, digest: &[u8]) -> Vec<u8> {
    let mut section = Vec::new();
    write_header(&mut section, "Name", name);
    write_header(&mut section, DIGEST_HEADER, &BASE64.encode(digest));
    section.extend_from_slice(b"\r\n");
    section
}

fn algorithm(oid: ObjectIdentifier) -> Result<AlgorithmIdentifierOwned> {
    Ok(AlgorithmIdentifierOwned {
        oid,
        parameters: Some(
            Any::new(Tag::Null, Vec::new()).map_err(|error| {
                signing_error(format!("Failed to encode the signature: {error}"))
            })?,
        ),
    })
}

fn signature_block(key: &SigningKey, signature_file: &[u8]) -> Result<Vec<u8>> {
    let encode_error = |error: x509_cert::der::Error| {
        signing_error(format!("Failed to encode the signature: {error}"))
    };
    let certificate = Certificate::from_der(key.certificate_der()).map_err(encode_error)?;
    let signer = SignerInfo {
        version: CmsVersion::V1,
        sid: SignerIdentifier::IssuerAndSerialNumber(IssuerAndSerialNumber {
            issuer: certificate.tbs_certificate.issuer.clone(),
            serial_number: certificate.tbs_certificate.serial_number.clone(),
        }),
        digest_alg: algorithm(ID_SHA256)?,
        signed_attrs: None,
        signature_algorithm: algorithm(RSA_ENCRYPTION)?,
        signature: OctetString::new(key.sign_sha256(signature_file)?).map_err(encode_error)?,
        unsigned_attrs: None,
    };
    let signed_data = SignedData {
        version: CmsVersion::V1,
        digest_algorithms: SetOfVec::try_from(vec![algorithm(ID_SHA256)?]).map_err(encode_error)?,
        encap_content_info: EncapsulatedContentInfo {
            econtent_type: ID_DATA,
            econtent: None,
        },
        certificates: Some(CertificateSet(
            SetOfVec::try_from(vec![CertificateChoices::Certificate(certificate)])
                .map_err(encode_error)?,
        )),
        crls: None,
        signer_infos: SignerInfos(SetOfVec::try_from(vec![signer]).map_err(encode_error)?),
    };
    ContentInfo {
        content_type: ID_SIGNED_DATA,
        content: Any::encode_from(&signed_data).map_err(encode_error)?,
    }
    .to_der()
    .map_err(encode_error)
}

/// Signs an archive whose entries, in order, have these names and SHA-256
/// digests of their uncompressed data.
pub fn sign(entries: &[(String, [u8; 32])], key: &SigningKey) -> Result<JarSignature> {
    let mut manifest = Vec::new();
    write_header(&mut manifest, "Manifest-Version", "1.0");
    write_header(&mut manifest, "Created-By", CREATED_BY);
    manifest.extend_from_slice(b"\r\n");
    let main_attributes_digest = Sha256::digest(&manifest);

    let mut entry_sections = Vec::new();
    for (name, digest) in entries {
        if is_signature_entry(name) || name.ends_with('/') {
            return Err(signing_error(format!("{name} cannot be signed.")));
        }
        let section = digest_section(name, digest);
        manifest.extend_from_slice(&section);
        entry_sections.push(digest_section(name, &Sha256::digest(&section)));
    }

    let mut signature_file = Vec::new();
    write_header(&mut signature_file, "Signature-Version", "1.0");
    write_header(&mut signature_file, "Created-By", CREATED_BY);
    write_header(
        &mut signature_file,
        "SHA-256-Digest-Manifest",
        &BASE64.encode(Sha256::digest(&manifest)),
    );
    write_header(
        &mut signature_file,
        "SHA-256-Digest-Manifest-Main-Attributes",
        &BASE64.encode(main_attributes_digest),
    );
    signature_file.extend_from_slice(b"\r\n");
    for section in entry_sections {
        signature_file.extend_from_slice(&section);
    }

    let signature_block = signature_block(key, &signature_file)?;
    Ok(JarSignature {
        manifest,
        signature_file,
        signature_block,
    })
}

/// A manifest or signature file section: its headers and its exact bytes,
/// including the blank line that ends it.
struct Section<'a> {
    headers: Vec<(String, String)>,
    bytes: &'a [u8],
}

impl Section<'_> {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(header, _)| header.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }
}

fn parse_sections(bytes: &[u8]) -> Result<Vec<Section<'_>>> {
    let damaged = || ExportError::validation("The bundle signature files are damaged.");
    let mut sections = Vec::new();
    let mut start = 0;
    let mut position = 0;
    let mut lines: Vec<Vec<u8>> = Vec::new();
    while position < bytes.len() {
        let end = bytes[position..]
            .windows(2)
            .position(|pair| pair == b"\r\n")
            .map(|offset| position + offset)
            .ok_or_else(damaged)?;
        let line = &bytes[position..end];
        position = end + 2;
        if line.is_empty() {
            let headers = lines
                .drain(..)
                .map(|line| {
                    let line = String::from_utf8(line).map_err(|_| damaged())?;
                    let (name, value) = line.split_once(": ").ok_or_else(damaged)?;
                    Ok((name.to_string(), value.to_string()))
                })
                .collect::<Result<Vec<_>>>()?;
            sections.push(Section {
                headers,
                bytes: &bytes[start..position],
            });
            start = position;
        } else if let Some(continued) = line.strip_prefix(b" ") {
            lines
                .last_mut()
                .ok_or_else(damaged)?
                .extend_from_slice(continued);
        } else {
            lines.push(line.to_vec());
        }
    }
    if !lines.is_empty() || sections.is_empty() {
        return Err(damaged());
    }
    Ok(sections)
}

/// Streams an entry's uncompressed bytes through SHA-256.
fn entry_digest(
    file: &mut File,
    entry: &ZipEntry,
    on_bytes: &mut dyn FnMut(u64),
) -> Result<[u8; 32]> {
    let mut hasher = Sha256::new();
    zip::for_each_chunk(file, entry, &mut |chunk| {
        hasher.update(chunk);
        on_bytes(chunk.len() as u64);
    })?;
    Ok(hasher.finalize().into())
}

/// Checks the signature block and returns the signing certificate.
fn verify_signature_block(block: &[u8], signature_file: &[u8]) -> Result<Vec<u8>> {
    let damaged = || ExportError::validation("The bundle signature is damaged.");
    let content_info = ContentInfo::from_der(block).map_err(|_| damaged())?;
    if content_info.content_type != ID_SIGNED_DATA {
        return Err(damaged());
    }
    let signed_data: SignedData = content_info.content.decode_as().map_err(|_| damaged())?;
    if signed_data.encap_content_info.econtent.is_some() {
        return Err(damaged());
    }
    let signers = signed_data.signer_infos.0.as_slice();
    let [signer] = signers else {
        return Err(ExportError::validation(
            "The bundle must have exactly one signer.",
        ));
    };
    if signer.digest_alg.oid != ID_SHA256
        || signer.signed_attrs.is_some()
        || ![RSA_ENCRYPTION, SHA256_WITH_RSA].contains(&signer.signature_algorithm.oid)
    {
        return Err(damaged());
    }
    let SignerIdentifier::IssuerAndSerialNumber(id) = &signer.sid else {
        return Err(damaged());
    };
    let certificate = signed_data
        .certificates
        .as_ref()
        .into_iter()
        .flat_map(|set| set.0.iter())
        .find_map(|choice| match choice {
            CertificateChoices::Certificate(certificate)
                if certificate.tbs_certificate.issuer == id.issuer
                    && certificate.tbs_certificate.serial_number == id.serial_number =>
            {
                Some(certificate)
            }
            _ => None,
        })
        .ok_or_else(damaged)?;
    let public_key_der = certificate
        .tbs_certificate
        .subject_public_key_info
        .to_der()
        .map_err(|_| damaged())?;
    let public_key = RsaPublicKey::from_public_key_der(&public_key_der).map_err(|_| damaged())?;
    let signature = Signature::try_from(signer.signature.as_bytes()).map_err(|_| damaged())?;
    VerifyingKey::<Sha256>::new(public_key)
        .verify(signature_file, &signature)
        .map_err(|_| ExportError::validation("The bundle signature does not verify."))?;
    certificate.to_der().map_err(|_| damaged())
}

/// Verifies a JAR-signed archive and returns the SHA-256 of its signing
/// certificate. Every entry must be listed with a matching digest.
pub fn verify(path: &Path, on_progress: &dyn Fn(u64, u64)) -> Result<[u8; 32]> {
    let mismatch = |name: &str| {
        ExportError::validation(format!("The bundle signature does not cover {name}."))
    };
    let mut file = File::open(path).map_err(|error| {
        ExportError::validation(format!("Failed to reopen the bundle: {error}"))
    })?;
    let index = zip::read_index(&mut file)?;
    let signature_entries: Vec<&ZipEntry> = index
        .entries
        .iter()
        .filter(|entry| is_signature_entry(&entry.name))
        .collect();
    let names: Vec<&str> = signature_entries
        .iter()
        .map(|entry| entry.name.as_str())
        .collect();
    if names.len() != 3
        || ![MANIFEST_ENTRY, SIGNATURE_FILE_ENTRY, SIGNATURE_BLOCK_ENTRY]
            .iter()
            .all(|name| names.contains(name))
    {
        return Err(ExportError::validation("The bundle is not signed."));
    }
    let read = |file: &mut File, name: &str| {
        let entry = index.entry(name).expect("signature entry listed above");
        zip::read_entry(file, entry)
    };
    let manifest = read(&mut file, MANIFEST_ENTRY)?;
    let signature_file = read(&mut file, SIGNATURE_FILE_ENTRY)?;
    let signature_block = read(&mut file, SIGNATURE_BLOCK_ENTRY)?;
    let certificate = verify_signature_block(&signature_block, &signature_file)?;

    let signature_sections = parse_sections(&signature_file)?;
    let manifest_digest = BASE64.encode(Sha256::digest(&manifest));
    if signature_sections[0].header("SHA-256-Digest-Manifest") != Some(manifest_digest.as_str()) {
        return Err(ExportError::validation(
            "The bundle signature does not match its manifest.",
        ));
    }
    let manifest_sections = parse_sections(&manifest)?;
    if signature_sections.len() != manifest_sections.len() {
        return Err(ExportError::validation(
            "The bundle signature does not match its manifest.",
        ));
    }
    let mut digests = std::collections::HashMap::new();
    for (section, signed) in manifest_sections.iter().zip(&signature_sections).skip(1) {
        let name = section.header("Name").ok_or_else(|| mismatch("an entry"))?;
        let section_digest = BASE64.encode(Sha256::digest(section.bytes));
        if signed.header("Name") != Some(name)
            || signed.header(DIGEST_HEADER) != Some(section_digest.as_str())
        {
            return Err(mismatch(name));
        }
        let digest = section
            .header(DIGEST_HEADER)
            .ok_or_else(|| mismatch(name))?;
        if digests
            .insert(name.to_string(), digest.to_string())
            .is_some()
        {
            return Err(mismatch(name));
        }
    }

    let signed_entries: Vec<&ZipEntry> = index
        .entries
        .iter()
        .filter(|entry| !is_signature_entry(&entry.name) && !entry.name.ends_with('/'))
        .collect();
    if signed_entries.len() != digests.len() {
        return Err(ExportError::validation(
            "The bundle signature lists other entries than the bundle has.",
        ));
    }
    let total: u64 = signed_entries
        .iter()
        .map(|entry| entry.uncompressed_size)
        .sum();
    let mut done = 0u64;
    on_progress(0, total);
    for entry in signed_entries {
        let expected = digests
            .get(&entry.name)
            .ok_or_else(|| mismatch(&entry.name))?;
        let actual = entry_digest(&mut file, entry, &mut |bytes| {
            done += bytes;
            on_progress(done, total);
        })?;
        if BASE64.encode(actual) != *expected {
            return Err(mismatch(&entry.name));
        }
    }
    Ok(Sha256::digest(certificate).into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wraps_long_headers_at_72_bytes() {
        let mut output = Vec::new();
        let name = format!("base/assets/{}.js", "x".repeat(150));
        write_header(&mut output, "Name", &name);
        let text = String::from_utf8(output.clone()).unwrap();
        let lines: Vec<&str> = text.split_terminator("\r\n").collect();
        assert!(lines.len() > 2);
        assert!(lines.iter().all(|line| line.len() <= 72));
        assert!(lines[1..].iter().all(|line| line.starts_with(' ')));
        let joined: String = lines
            .iter()
            .enumerate()
            .map(|(index, line)| if index == 0 { *line } else { &line[1..] })
            .collect();
        assert_eq!(joined, format!("Name: {name}"));

        output.extend_from_slice(b"\r\n");
        let sections = parse_sections(&output).unwrap();
        assert_eq!(sections[0].header("Name"), Some(name.as_str()));
    }

    #[test]
    fn a_header_of_exactly_72_bytes_stays_on_one_line() {
        let mut output = Vec::new();
        write_header(&mut output, "Name", &"y".repeat(66));
        assert_eq!(output.len(), 74);
    }
}
