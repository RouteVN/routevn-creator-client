//! Android signing keys and APK Signature Scheme v2.
//!
//! A signing key is an RSA private key with a self-signed X.509 certificate.
//! Creator makes one (Create Key), reads one from a PKCS #12 keystore
//! (Upload Key), writes a PKCS #12 keystore of one (Save a Copy), and signs
//! exported APKs with APK Signature Scheme v2:
//! <https://source.android.com/docs/security/features/apksigning/v2>.
//!
//! The project stores its keys as [`SigningKeyMaterial`]; this crate holds no
//! key store of its own.
//!
//! Signing streams the APK from disk in 1 MiB chunks, so memory stays bounded
//! by the central directory, which is small.

use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::Path;
use std::time::Duration;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use rsa::pkcs1v15::{Signature, SigningKey as RsaSigningKey, VerifyingKey};
use rsa::pkcs8::{DecodePublicKey, EncodePrivateKey, PrivateKeyInfo};
use rsa::signature::{SignatureEncoding, Signer, Verifier};
use rsa::traits::PublicKeyParts;
use rsa::{RsaPrivateKey, RsaPublicKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use x509_cert::Certificate;
use x509_cert::attr::AttributeTypeAndValue;
use x509_cert::builder::{Builder, CertificateBuilder, Profile};
use x509_cert::der::asn1::{Any, ObjectIdentifier, SetOfVec};
use x509_cert::der::pem::LineEnding;
use x509_cert::der::{Decode, Encode, EncodePem, Tag};
use x509_cert::name::{Name, RdnSequence, RelativeDistinguishedName};
use x509_cert::serial_number::SerialNumber;
use x509_cert::spki::SubjectPublicKeyInfoOwned;
use x509_cert::time::Validity;
use zeroize::{Zeroize, Zeroizing};

use crate::error::{ErrorCode, ExportError, Result};
use crate::zip::read_at;

/// Google Play requires at least 2048 bits.
pub const MIN_RSA_KEY_BITS: usize = 2048;
const CREATED_KEY_BITS: usize = 2048;
/// 30 years, plus the leap days in them.
const CERTIFICATE_VALIDITY: Duration = Duration::from_secs((30 * 365 + 8) * 24 * 60 * 60);
/// X.520 limits a common name to 64 characters.
const MAX_COMMON_NAME_CHARS: usize = 64;
const COMMON_NAME_OID: ObjectIdentifier = ObjectIdentifier::new_unwrap("2.5.4.3");
/// Stores treat a certificate with this subject as a debug build.
const DEBUG_COMMON_NAME: &str = "Android Debug";
/// A keystore larger than this is not a signing keystore.
const MAX_KEYSTORE_BYTES: u64 = 1024 * 1024;
/// `keytool` refuses shorter PKCS #12 passwords.
pub const MIN_KEYSTORE_PASSWORD_CHARS: usize = 6;

const CHUNK_SIZE: u64 = 1024 * 1024;
const RSA_PKCS1_V1_5_WITH_SHA256: u32 = 0x0103;
const APK_SIGNATURE_SCHEME_V2_BLOCK_ID: u32 = 0x7109_871a;
const APK_SIGNING_BLOCK_MAGIC: &[u8; 16] = b"APK Sig Block 42";
const EOCD_SIGNATURE: u32 = 0x0605_4b50;
const EOCD_SIZE: u64 = 22;
const MAX_EOCD_COMMENT: u64 = 0xffff;
/// Larger than any signing block Creator or a store writes.
const MAX_SIGNING_BLOCK_BYTES: u64 = 16 * 1024 * 1024;
/// JKS and JCEKS keystores start with these magic numbers.
const JAVA_KEYSTORE_MAGICS: [[u8; 4]; 2] = [[0xfe, 0xed, 0xfe, 0xed], [0xce, 0xce, 0xce, 0xce]];

pub struct SigningKey {
    private_key: RsaPrivateKey,
    certificate_der: Vec<u8>,
    public_key_der: Vec<u8>,
    certificate_sha256: [u8; 32],
    subject: String,
}

impl std::fmt::Debug for SigningKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SigningKey")
            .field("certificate_sha256", &self.certificate_sha256_hex())
            .field("subject", &self.subject)
            .finish_non_exhaustive()
    }
}

impl SigningKey {
    /// Create Key: a new RSA 2048 key with a self-signed certificate whose
    /// subject is the game's name.
    pub fn generate(application_name: &str, application_id: &str) -> Result<Self> {
        let mut rng = rand::thread_rng();
        let private_key = RsaPrivateKey::new(&mut rng, CREATED_KEY_BITS)
            .map_err(|error| signing_error(format!("Failed to create the key: {error}")))?;
        let public_key_info = SubjectPublicKeyInfoOwned::from_key(private_key.to_public_key())
            .map_err(|error| signing_error(format!("Failed to encode the public key: {error}")))?;
        let subject = common_name_subject(application_name, application_id)?;

        let mut serial = [0u8; 16];
        rand::RngCore::fill_bytes(&mut rng, &mut serial);
        // A positive serial number with no leading zero byte.
        serial[0] = (serial[0] & 0x7f) | 0x01;
        let validity = Validity::from_now(CERTIFICATE_VALIDITY).map_err(|error| {
            signing_error(format!("Failed to set the certificate dates: {error}"))
        })?;
        let signer = RsaSigningKey::<Sha256>::new(private_key.clone());
        let builder = CertificateBuilder::new(
            Profile::Leaf {
                issuer: subject.clone(),
                enable_key_agreement: false,
                enable_key_encipherment: false,
            },
            SerialNumber::new(&serial)
                .map_err(|error| signing_error(format!("Invalid serial number: {error}")))?,
            validity,
            subject,
            public_key_info,
            &signer,
        )
        .map_err(|error| signing_error(format!("Failed to build the certificate: {error}")))?;
        let certificate = builder
            .build::<Signature>()
            .map_err(|error| signing_error(format!("Failed to sign the certificate: {error}")))?;
        let certificate_der = certificate
            .to_der()
            .map_err(|error| signing_error(format!("Failed to encode the certificate: {error}")))?;
        Self::from_key_and_certificate(private_key, &certificate_der)
    }

    /// A key read from the project or a keystore file.
    pub fn from_pkcs8_der(private_key_der: &[u8], certificate_der: &[u8]) -> Result<Self> {
        let unreadable = || {
            ExportError::new(
                ErrorCode::SigningKeyInvalid,
                "The private key cannot be read.",
            )
        };
        // A damaged key is invalid; only a readable key of another type is
        // unsupported.
        let info = PrivateKeyInfo::try_from(private_key_der).map_err(|_| unreadable())?;
        if info.algorithm.oid != rsa::pkcs1::ALGORITHM_OID {
            return Err(ExportError::new(
                ErrorCode::SigningKeyUnsupported,
                "Only RSA signing keys are supported.",
            ));
        }
        let private_key = RsaPrivateKey::try_from(info).map_err(|_| unreadable())?;
        Self::from_key_and_certificate(private_key, certificate_der)
    }

    fn from_key_and_certificate(
        private_key: RsaPrivateKey,
        certificate_der: &[u8],
    ) -> Result<Self> {
        let bits = private_key.size() * 8;
        if bits < MIN_RSA_KEY_BITS {
            return Err(ExportError::new(
                ErrorCode::SigningKeyUnsupported,
                format!("The key has {bits} bits; at least {MIN_RSA_KEY_BITS} are required."),
            ));
        }
        let certificate = Certificate::from_der(certificate_der).map_err(|error| {
            ExportError::new(
                ErrorCode::SigningKeyInvalid,
                format!("The certificate cannot be read: {error}"),
            )
        })?;
        let public_key_der = certificate
            .tbs_certificate
            .subject_public_key_info
            .to_der()
            .map_err(|error| signing_error(format!("Failed to encode the public key: {error}")))?;
        let certificate_key = RsaPublicKey::from_public_key_der(&public_key_der).map_err(|_| {
            ExportError::new(
                ErrorCode::SigningKeyUnsupported,
                "The certificate does not hold an RSA key.",
            )
        })?;
        if certificate_key != private_key.to_public_key() {
            return Err(ExportError::new(
                ErrorCode::SigningKeyInvalid,
                "The certificate does not belong to the private key.",
            ));
        }
        Ok(Self {
            private_key,
            certificate_sha256: Sha256::digest(certificate_der).into(),
            certificate_der: certificate_der.to_vec(),
            public_key_der,
            subject: certificate.tbs_certificate.subject.to_string(),
        })
    }

    /// Upload Key: reads the private key entry of a PKCS #12 keystore. A
    /// keystore with several keys needs `alias`.
    pub fn read_pkcs12_file(path: &Path, password: &str, alias: Option<&str>) -> Result<Self> {
        // A file that cannot be read is not reported as "not a key file".
        let mut file = File::open(path)
            .map_err(|error| signing_error(format!("Failed to open the keystore: {error}")))?;
        let length = file
            .metadata()
            .map_err(|error| signing_error(format!("Failed to read the keystore: {error}")))?
            .len();
        if length > MAX_KEYSTORE_BYTES {
            return Err(ExportError::new(
                ErrorCode::SigningKeyInvalid,
                "The file is too large to be a keystore.",
            ));
        }
        let mut data = Vec::with_capacity(length as usize);
        file.read_to_end(&mut data)
            .map_err(|error| signing_error(format!("Failed to read the keystore: {error}")))?;
        Self::read_pkcs12(&data, password, alias)
    }

    pub fn read_pkcs12(data: &[u8], password: &str, alias: Option<&str>) -> Result<Self> {
        if data.len() >= 4
            && JAVA_KEYSTORE_MAGICS
                .iter()
                .any(|magic| data[..4] == magic[..])
        {
            return Err(ExportError::new(
                ErrorCode::KeystoreLegacyFormat,
                "This is a legacy JKS or JCEKS keystore. Convert it to PKCS #12 with keytool -importkeystore.",
            ));
        }
        let keystore =
            p12_keystore::KeyStore::from_pkcs12(data, password).map_err(|error| match error {
                p12_keystore::error::Error::MacError(_) => ExportError::new(
                    ErrorCode::KeystorePasswordIncorrect,
                    "The keystore password is incorrect.",
                ),
                other => ExportError::new(
                    ErrorCode::SigningKeyInvalid,
                    format!(
                        "The file is not a PKCS #12 keystore, or the password is incorrect: {other}"
                    ),
                ),
            })?;
        let keys: Vec<(&String, &p12_keystore::PrivateKeyChain)> = keystore
            .entries()
            .filter_map(|(name, entry)| match entry {
                p12_keystore::KeyStoreEntry::PrivateKeyChain(chain) => Some((name, chain)),
                _ => None,
            })
            .collect();
        let chain = match alias.map(str::trim).filter(|alias| !alias.is_empty()) {
            Some(alias) => keys
                .iter()
                .find(|(name, _)| name.eq_ignore_ascii_case(alias))
                .map(|(_, chain)| *chain)
                .ok_or_else(|| {
                    ExportError::new(
                        ErrorCode::KeystoreAliasNotFound,
                        format!(
                            "The keystore has no key named {alias}. Its keys: {}.",
                            alias_list(&keys)
                        ),
                    )
                })?,
            None => match keys.as_slice() {
                [] => {
                    return Err(ExportError::new(
                        ErrorCode::SigningKeyInvalid,
                        "The keystore holds no private key.",
                    ));
                }
                [(_, chain)] => *chain,
                _ => {
                    return Err(ExportError::new(
                        ErrorCode::KeystoreAliasRequired,
                        format!(
                            "The keystore holds several keys: {}. Enter the alias of the one to use.",
                            alias_list(&keys)
                        ),
                    ));
                }
            },
        };
        let certificate = chain.chain().first().ok_or_else(|| {
            ExportError::new(
                ErrorCode::SigningKeyInvalid,
                "The key in the keystore has no certificate.",
            )
        })?;
        Self::from_pkcs8_der(chain.key(), certificate.as_der())
    }

    /// Save a Copy: a PKCS #12 keystore with PBES2 AES-256 encryption and an
    /// HMAC-SHA256 MAC, which current `keytool`, `apksigner`, and Gradle read.
    pub fn to_pkcs12(&self, password: &str, alias: &str) -> Result<Vec<u8>> {
        if password.chars().count() < MIN_KEYSTORE_PASSWORD_CHARS {
            return Err(ExportError::invalid_request(format!(
                "The keystore password needs at least {MIN_KEYSTORE_PASSWORD_CHARS} characters."
            )));
        }
        let private_key_der = self.private_key_pkcs8_der()?;
        let certificate = p12_keystore::Certificate::from_der(&self.certificate_der)
            .map_err(|error| signing_error(format!("Failed to read the certificate: {error}")))?;
        let local_key_id = self.certificate_sha256[..20].to_vec();
        let mut keystore = p12_keystore::KeyStore::new();
        keystore.add_entry(
            alias,
            p12_keystore::KeyStoreEntry::PrivateKeyChain(p12_keystore::PrivateKeyChain::new(
                private_key_der.as_bytes(),
                local_key_id,
                [certificate],
            )),
        );
        keystore
            .writer(password)
            .encryption_algorithm(p12_keystore::EncryptionAlgorithm::PbeWithHmacSha256AndAes256)
            .mac_algorithm(p12_keystore::MacAlgorithm::HmacSha256)
            .write()
            .map_err(|error| signing_error(format!("Failed to write the keystore: {error}")))
    }

    pub fn private_key_pkcs8_der(&self) -> Result<rsa::pkcs8::SecretDocument> {
        self.private_key
            .to_pkcs8_der()
            .map_err(|error| signing_error(format!("Failed to encode the private key: {error}")))
    }

    /// An RSA PKCS #1 v1.5 signature of `message` with SHA-256.
    pub(crate) fn sign_sha256(&self, message: &[u8]) -> Result<Vec<u8>> {
        Ok(RsaSigningKey::<Sha256>::new(self.private_key.clone())
            .try_sign(message)
            .map_err(|error| signing_error(format!("Failed to sign: {error}")))?
            .to_vec())
    }

    pub fn certificate_der(&self) -> &[u8] {
        &self.certificate_der
    }

    pub fn certificate_sha256(&self) -> [u8; 32] {
        self.certificate_sha256
    }

    pub fn certificate_sha256_hex(&self) -> String {
        hex(&self.certificate_sha256)
    }

    pub fn subject(&self) -> &str {
        &self.subject
    }

    /// The public certificate as PEM.
    pub fn certificate_pem(&self) -> Result<String> {
        Certificate::from_der(&self.certificate_der)
            .and_then(|certificate| certificate.to_pem(LineEnding::LF))
            .map_err(|error| signing_error(format!("Failed to encode the certificate: {error}")))
    }

    /// The key as the project stores it.
    pub fn to_material(&self) -> Result<SigningKeyMaterial> {
        let private_key = self.private_key_pkcs8_der()?;
        Ok(SigningKeyMaterial {
            certificate_sha256: self.certificate_sha256_hex(),
            certificate: BASE64.encode(&self.certificate_der),
            private_key: BASE64.encode(private_key.as_bytes()),
        })
    }

    /// A key the project stored. The certificate must match the fingerprint
    /// stored with it, so a damaged or edited record never signs.
    pub fn from_material(material: &SigningKeyMaterial) -> Result<Self> {
        let damaged =
            |message: &str| ExportError::new(ErrorCode::SigningKeyInvalid, message.to_string());
        let certificate = BASE64
            .decode(&material.certificate)
            .map_err(|_| damaged("The stored signing certificate is damaged."))?;
        let private_key = Zeroizing::new(
            BASE64
                .decode(&material.private_key)
                .map_err(|_| damaged("The stored signing key is damaged."))?,
        );
        let key = Self::from_pkcs8_der(&private_key, &certificate)?;
        if key.certificate_sha256_hex() != material.certificate_sha256 {
            return Err(damaged(
                "The stored signing certificate does not match its fingerprint.",
            ));
        }
        Ok(key)
    }
}

/// A signing key as the project stores it: the DER certificate and the PKCS #8
/// DER private key, each in base64, and the certificate's SHA-256 as 64
/// lowercase hex digits.
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SigningKeyMaterial {
    pub certificate_sha256: String,
    pub certificate: String,
    pub private_key: String,
}

impl Drop for SigningKeyMaterial {
    fn drop(&mut self) {
        self.private_key.zeroize();
    }
}

impl std::fmt::Debug for SigningKeyMaterial {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SigningKeyMaterial")
            .field("certificate_sha256", &self.certificate_sha256)
            .finish_non_exhaustive()
    }
}

/// Writes a file readable only by the user, through a temporary file in the
/// same folder that is renamed into place, so an interrupted write never
/// leaves part of a keystore.
pub fn write_private_file(path: &Path, bytes: &[u8]) -> Result<()> {
    let dir = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let write_error =
        |error: std::io::Error| ExportError::write(format!("Failed to save the file: {error}"));
    // tempfile creates the file with owner-only permissions on Unix.
    let mut partial = tempfile::Builder::new()
        .prefix(".routevn-key-")
        .suffix(".partial")
        .tempfile_in(dir)
        .map_err(write_error)?;
    partial.write_all(bytes).map_err(write_error)?;
    partial.as_file().sync_all().map_err(write_error)?;
    partial
        .persist(path)
        .map_err(|error| write_error(error.error))?;
    #[cfg(unix)]
    if let Ok(dir) = File::open(dir) {
        let _ = dir.sync_all();
    }
    Ok(())
}

fn alias_list(keys: &[(&String, &p12_keystore::PrivateKeyChain)]) -> String {
    keys.iter()
        .map(|(name, _)| name.as_str())
        .collect::<Vec<_>>()
        .join(", ")
}

fn signing_error(message: impl Into<String>) -> ExportError {
    ExportError::new(ErrorCode::SigningFailed, message)
}

/// `CN=<application name>`, built from parts so that commas, quotes, and
/// other characters in a name need no escaping.
fn common_name_subject(application_name: &str, application_id: &str) -> Result<Name> {
    let mut common_name: String = application_name
        .trim()
        .chars()
        .take(MAX_COMMON_NAME_CHARS)
        .collect();
    if common_name.is_empty() || common_name.eq_ignore_ascii_case(DEBUG_COMMON_NAME) {
        common_name = application_id.chars().take(MAX_COMMON_NAME_CHARS).collect();
    }
    let value = Any::new(Tag::Utf8String, common_name.as_bytes())
        .map_err(|error| signing_error(format!("Invalid certificate name: {error}")))?;
    let attribute = AttributeTypeAndValue {
        oid: COMMON_NAME_OID,
        value,
    };
    let rdn = RelativeDistinguishedName(
        SetOfVec::try_from(vec![attribute])
            .map_err(|error| signing_error(format!("Invalid certificate name: {error}")))?,
    );
    Ok(RdnSequence(vec![rdn]))
}

pub fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write as _;
    bytes
        .iter()
        .fold(String::with_capacity(bytes.len() * 2), |mut text, byte| {
            let _ = write!(text, "{byte:02x}");
            text
        })
}

struct ZipTail {
    eocd_offset: u64,
    eocd: Vec<u8>,
    central_directory_offset: u64,
    central_directory_size: u64,
}

fn read_zip_tail(file: &mut File) -> Result<ZipTail> {
    let length = file
        .metadata()
        .map_err(|error| ExportError::validation(format!("Failed to read the APK size: {error}")))?
        .len();
    if length < EOCD_SIZE {
        return Err(ExportError::validation("The APK is too small."));
    }
    let search_length = length.min(EOCD_SIZE + MAX_EOCD_COMMENT);
    let search_start = length - search_length;
    let tail = read_at(file, search_start, search_length as usize)?;
    let mut position = tail.len() - EOCD_SIZE as usize;
    loop {
        if u32::from_le_bytes(tail[position..position + 4].try_into().unwrap()) == EOCD_SIGNATURE {
            let comment_length =
                u16::from_le_bytes([tail[position + 20], tail[position + 21]]) as usize;
            if position + EOCD_SIZE as usize + comment_length == tail.len() {
                let eocd = tail[position..].to_vec();
                let central_directory_size =
                    u64::from(u32::from_le_bytes(eocd[12..16].try_into().unwrap()));
                let central_directory_offset =
                    u64::from(u32::from_le_bytes(eocd[16..20].try_into().unwrap()));
                let eocd_offset = search_start + position as u64;
                if central_directory_offset + central_directory_size != eocd_offset {
                    return Err(ExportError::validation(
                        "The APK central directory is not directly before its end record.",
                    ));
                }
                return Ok(ZipTail {
                    eocd_offset,
                    eocd,
                    central_directory_offset,
                    central_directory_size,
                });
            }
        }
        if position == 0 {
            return Err(ExportError::validation(
                "The APK has no end of central directory record.",
            ));
        }
        position -= 1;
    }
}

/// The v2 content digest of the three signed sections: the ZIP entries up to
/// `entries_end`, the central directory, and the end record.
fn content_digest(
    file: &mut File,
    entries_end: u64,
    central_directory: &[u8],
    eocd: &[u8],
    on_progress: &dyn Fn(u64, u64),
) -> Result<[u8; 32]> {
    let chunk_count = |length: u64| length.div_ceil(CHUNK_SIZE);
    let total_chunks = chunk_count(entries_end)
        + chunk_count(central_directory.len() as u64)
        + chunk_count(eocd.len() as u64);
    let total_chunks = u32::try_from(total_chunks)
        .map_err(|_| ExportError::new(ErrorCode::TooLarge, "The APK is too large to sign."))?;
    let total_bytes = entries_end + central_directory.len() as u64 + eocd.len() as u64;

    let mut chunk_digests = Vec::with_capacity(total_chunks as usize * 32);
    let mut digest_chunk = |chunk: &[u8]| {
        let mut hasher = Sha256::new();
        hasher.update([0xa5]);
        hasher.update((chunk.len() as u32).to_le_bytes());
        hasher.update(chunk);
        chunk_digests.extend_from_slice(&hasher.finalize());
    };

    file.seek(SeekFrom::Start(0))
        .map_err(|error| ExportError::write(format!("Failed to read the APK: {error}")))?;
    let mut buffer = vec![0u8; CHUNK_SIZE as usize];
    let mut done = 0u64;
    on_progress(0, total_bytes);
    while done < entries_end {
        let length = (entries_end - done).min(CHUNK_SIZE) as usize;
        file.read_exact(&mut buffer[..length])
            .map_err(|error| ExportError::write(format!("Failed to read the APK: {error}")))?;
        digest_chunk(&buffer[..length]);
        done += length as u64;
        on_progress(done, total_bytes);
    }
    for section in [central_directory, eocd] {
        for chunk in section.chunks(CHUNK_SIZE as usize) {
            digest_chunk(chunk);
        }
    }
    on_progress(total_bytes, total_bytes);

    let mut hasher = Sha256::new();
    hasher.update([0x5a]);
    hasher.update(total_chunks.to_le_bytes());
    hasher.update(&chunk_digests);
    Ok(hasher.finalize().into())
}

fn push_prefixed(target: &mut Vec<u8>, bytes: &[u8]) -> Result<()> {
    let length = u32::try_from(bytes.len())
        .map_err(|_| signing_error("A signing block field is too large."))?;
    target.extend_from_slice(&length.to_le_bytes());
    target.extend_from_slice(bytes);
    Ok(())
}

fn signing_block(key: &SigningKey, digest: &[u8; 32]) -> Result<Vec<u8>> {
    let mut digest_entry = RSA_PKCS1_V1_5_WITH_SHA256.to_le_bytes().to_vec();
    push_prefixed(&mut digest_entry, digest)?;
    let mut digests = Vec::new();
    push_prefixed(&mut digests, &digest_entry)?;
    let mut certificates = Vec::new();
    push_prefixed(&mut certificates, &key.certificate_der)?;
    let mut signed_data = Vec::new();
    push_prefixed(&mut signed_data, &digests)?;
    push_prefixed(&mut signed_data, &certificates)?;
    push_prefixed(&mut signed_data, &[])?;

    let signature = RsaSigningKey::<Sha256>::new(key.private_key.clone())
        .try_sign(&signed_data)
        .map_err(|error| signing_error(format!("Failed to sign the APK: {error}")))?
        .to_vec();
    let mut signature_entry = RSA_PKCS1_V1_5_WITH_SHA256.to_le_bytes().to_vec();
    push_prefixed(&mut signature_entry, &signature)?;
    let mut signatures = Vec::new();
    push_prefixed(&mut signatures, &signature_entry)?;

    let mut signer = Vec::new();
    push_prefixed(&mut signer, &signed_data)?;
    push_prefixed(&mut signer, &signatures)?;
    push_prefixed(&mut signer, &key.public_key_der)?;
    let mut signers = Vec::new();
    push_prefixed(&mut signers, &signer)?;
    let mut v2_block = Vec::new();
    push_prefixed(&mut v2_block, &signers)?;

    let mut pairs = Vec::new();
    pairs.extend_from_slice(&((4 + v2_block.len()) as u64).to_le_bytes());
    pairs.extend_from_slice(&APK_SIGNATURE_SCHEME_V2_BLOCK_ID.to_le_bytes());
    pairs.extend_from_slice(&v2_block);
    // The size fields count everything after the leading size field.
    let block_size = (pairs.len() + 8 + APK_SIGNING_BLOCK_MAGIC.len()) as u64;
    let mut block = Vec::with_capacity(block_size as usize + 8);
    block.extend_from_slice(&block_size.to_le_bytes());
    block.extend_from_slice(&pairs);
    block.extend_from_slice(&block_size.to_le_bytes());
    block.extend_from_slice(APK_SIGNING_BLOCK_MAGIC);
    Ok(block)
}

fn has_signing_block(file: &mut File, central_directory_offset: u64) -> Result<bool> {
    if central_directory_offset < APK_SIGNING_BLOCK_MAGIC.len() as u64 {
        return Ok(false);
    }
    let magic = read_at(
        file,
        central_directory_offset - APK_SIGNING_BLOCK_MAGIC.len() as u64,
        APK_SIGNING_BLOCK_MAGIC.len(),
    )?;
    Ok(magic == APK_SIGNING_BLOCK_MAGIC)
}

/// Signs an unsigned, aligned APK in place: inserts the APK Signing Block
/// before the central directory and moves the central directory after it.
/// Entry data does not move, so alignment is kept.
pub fn sign_apk(path: &Path, key: &SigningKey, on_progress: &dyn Fn(u64, u64)) -> Result<()> {
    let mut file = OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .map_err(|error| {
            ExportError::write(format!("Failed to open the APK to sign it: {error}"))
        })?;
    let tail = read_zip_tail(&mut file)?;
    if has_signing_block(&mut file, tail.central_directory_offset)? {
        return Err(ExportError::validation("The APK is already signed."));
    }
    let central_directory = read_at(
        &mut file,
        tail.central_directory_offset,
        tail.central_directory_size as usize,
    )?;
    let digest = content_digest(
        &mut file,
        tail.central_directory_offset,
        &central_directory,
        &tail.eocd,
        on_progress,
    )?;
    let block = signing_block(key, &digest)?;
    let moved_offset = u32::try_from(tail.central_directory_offset + block.len() as u64)
        .ok()
        .filter(|offset| *offset != u32::MAX)
        .ok_or_else(|| ExportError::new(ErrorCode::TooLarge, "The signed APK would need ZIP64."))?;
    let mut eocd = tail.eocd;
    eocd[16..20].copy_from_slice(&moved_offset.to_le_bytes());

    let write_error = |error: std::io::Error| {
        ExportError::write(format!("Failed to write the signed APK: {error}"))
    };
    file.set_len(tail.central_directory_offset)
        .map_err(write_error)?;
    file.seek(SeekFrom::Start(tail.central_directory_offset))
        .map_err(write_error)?;
    file.write_all(&block).map_err(write_error)?;
    file.write_all(&central_directory).map_err(write_error)?;
    file.write_all(&eocd).map_err(write_error)?;
    file.sync_all().map_err(write_error)?;
    debug_assert_eq!(
        tail.eocd_offset,
        tail.central_directory_offset + tail.central_directory_size
    );
    Ok(())
}

struct Cursor<'a>(&'a [u8]);

impl<'a> Cursor<'a> {
    fn u32(&mut self) -> Result<u32> {
        let (head, rest) = self
            .0
            .split_at_checked(4)
            .ok_or_else(|| ExportError::validation("The APK signature is damaged."))?;
        self.0 = rest;
        Ok(u32::from_le_bytes(head.try_into().unwrap()))
    }

    fn prefixed(&mut self) -> Result<&'a [u8]> {
        let length = self.u32()? as usize;
        let (head, rest) = self
            .0
            .split_at_checked(length)
            .ok_or_else(|| ExportError::validation("The APK signature is damaged."))?;
        self.0 = rest;
        Ok(head)
    }

    fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

/// Re-reads a signed APK, checks its v2 signature and content digest, and
/// returns the SHA-256 of the signing certificate.
pub fn verify_apk_signature(path: &Path, on_progress: &dyn Fn(u64, u64)) -> Result<[u8; 32]> {
    let damaged = || ExportError::validation("The APK signature is damaged.");
    let mut file = File::open(path)
        .map_err(|error| ExportError::validation(format!("Failed to reopen the APK: {error}")))?;
    let tail = read_zip_tail(&mut file)?;
    if !has_signing_block(&mut file, tail.central_directory_offset)? {
        return Err(ExportError::validation("The APK is not signed."));
    }
    // The smallest block: its size, at least one 8-byte pair length, and the
    // 24-byte footer.
    if tail.central_directory_offset < 40 {
        return Err(damaged());
    }
    let footer = read_at(&mut file, tail.central_directory_offset - 24, 24)?;
    let block_size = u64::from_le_bytes(footer[..8].try_into().unwrap());
    if !(32..=MAX_SIGNING_BLOCK_BYTES).contains(&block_size)
        || block_size + 8 > tail.central_directory_offset
    {
        return Err(damaged());
    }
    let block_offset = tail.central_directory_offset - block_size - 8;
    let block = read_at(&mut file, block_offset, (block_size + 8) as usize)?;
    if u64::from_le_bytes(block[..8].try_into().unwrap()) != block_size {
        return Err(damaged());
    }

    let mut pairs = &block[8..block.len() - 24];
    let mut v2_block = None;
    while !pairs.is_empty() {
        let (length, rest) = pairs.split_at_checked(8).ok_or_else(damaged)?;
        let length = u64::from_le_bytes(length.try_into().unwrap());
        let length = usize::try_from(length).map_err(|_| damaged())?;
        let (pair, rest) = rest.split_at_checked(length).ok_or_else(damaged)?;
        let (id, value) = pair.split_at_checked(4).ok_or_else(damaged)?;
        if u32::from_le_bytes(id.try_into().unwrap()) == APK_SIGNATURE_SCHEME_V2_BLOCK_ID {
            v2_block = Some(value);
            break;
        }
        pairs = rest;
    }
    let v2_block =
        v2_block.ok_or_else(|| ExportError::validation("The APK has no v2 signature."))?;

    let mut signers = Cursor(Cursor(v2_block).prefixed()?);
    let mut signer = Cursor(signers.prefixed()?);
    if !signers.is_empty() {
        return Err(ExportError::validation("The APK has more than one signer."));
    }
    let signed_data = signer.prefixed()?;
    let mut signatures = Cursor(signer.prefixed()?);
    let public_key_der = signer.prefixed()?;

    let mut signature = None;
    while !signatures.is_empty() {
        let mut entry = Cursor(signatures.prefixed()?);
        let algorithm = entry.u32()?;
        let bytes = entry.prefixed()?;
        if algorithm == RSA_PKCS1_V1_5_WITH_SHA256 {
            signature = Some(bytes);
        }
    }
    let signature = signature
        .ok_or_else(|| ExportError::validation("The APK has no RSA SHA-256 signature."))?;
    let public_key = RsaPublicKey::from_public_key_der(public_key_der)
        .map_err(|_| ExportError::validation("The APK signer's public key cannot be read."))?;
    let signature = Signature::try_from(signature).map_err(|_| damaged())?;
    VerifyingKey::<Sha256>::new(public_key)
        .verify(signed_data, &signature)
        .map_err(|_| ExportError::validation("The APK signature does not verify."))?;

    let mut signed = Cursor(signed_data);
    let mut digests = Cursor(signed.prefixed()?);
    let mut certificates = Cursor(signed.prefixed()?);
    let mut signed_digest = None;
    while !digests.is_empty() {
        let mut entry = Cursor(digests.prefixed()?);
        let algorithm = entry.u32()?;
        let bytes = entry.prefixed()?;
        if algorithm == RSA_PKCS1_V1_5_WITH_SHA256 {
            signed_digest = Some(bytes);
        }
    }
    let signed_digest = signed_digest
        .ok_or_else(|| ExportError::validation("The APK signature has no SHA-256 digest."))?;
    let certificate_der = certificates.prefixed()?;
    let certificate = Certificate::from_der(certificate_der)
        .map_err(|_| ExportError::validation("The APK signing certificate cannot be read."))?;
    let certificate_key_der = certificate
        .tbs_certificate
        .subject_public_key_info
        .to_der()
        .map_err(|_| damaged())?;
    if certificate_key_der != public_key_der {
        return Err(ExportError::validation(
            "The APK signing certificate does not match the signer's key.",
        ));
    }

    let central_directory = read_at(
        &mut file,
        tail.central_directory_offset,
        tail.central_directory_size as usize,
    )?;
    // The digest covers the end record as it was before signing, whose
    // central directory offset is where the signing block now starts.
    let mut eocd = tail.eocd;
    eocd[16..20].copy_from_slice(
        &u32::try_from(block_offset)
            .map_err(|_| damaged())?
            .to_le_bytes(),
    );
    let digest = content_digest(
        &mut file,
        block_offset,
        &central_directory,
        &eocd,
        on_progress,
    )?;
    if digest[..] != *signed_digest {
        return Err(ExportError::validation(
            "The APK contents do not match its signature.",
        ));
    }
    Ok(Sha256::digest(certificate_der).into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::OnceLock;

    fn test_key() -> &'static SigningKey {
        static KEY: OnceLock<SigningKey> = OnceLock::new();
        KEY.get_or_init(|| SigningKey::generate("Project One", "com.example.project_one").unwrap())
    }

    /// A minimal ZIP: one stored entry, its central directory, and the end
    /// record.
    fn write_test_zip(path: &Path, contents: &[u8]) {
        let file = File::create(path).unwrap();
        let mut writer = crate::zip::ZipWriter::new(file);
        writer.add_stored("assets/a.bin", contents).unwrap();
        writer
            .add_stored("AndroidManifest.xml", b"manifest")
            .unwrap();
        writer.finish().unwrap();
    }

    #[test]
    fn created_key_has_the_game_name_and_round_trips_through_pkcs12() {
        let key = test_key();
        assert_eq!(key.subject(), "CN=Project One");
        let fingerprint = key.certificate_sha256_hex();
        assert_eq!(fingerprint.len(), 64);
        assert!(
            fingerprint
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        );

        let backup = key
            .to_pkcs12("correct horse", "com.example.project_one")
            .unwrap();
        let restored = SigningKey::read_pkcs12(&backup, "correct horse", None).unwrap();
        assert_eq!(restored.certificate_sha256(), key.certificate_sha256());
        let by_alias =
            SigningKey::read_pkcs12(&backup, "correct horse", Some("COM.example.project_one"))
                .unwrap();
        assert_eq!(by_alias.certificate_sha256(), key.certificate_sha256());

        let wrong = SigningKey::read_pkcs12(&backup, "wrong horse", None).unwrap_err();
        assert_eq!(wrong.code, ErrorCode::KeystorePasswordIncorrect);
        let missing = SigningKey::read_pkcs12(&backup, "correct horse", Some("other")).unwrap_err();
        assert_eq!(missing.code, ErrorCode::KeystoreAliasNotFound);
        assert!(key.to_pkcs12("short", "a").is_err());
    }

    #[test]
    fn refuses_legacy_java_keystores_and_other_files() {
        let jks = SigningKey::read_pkcs12(&[0xfe, 0xed, 0xfe, 0xed, 0, 0, 0, 2], "password", None)
            .unwrap_err();
        assert_eq!(jks.code, ErrorCode::KeystoreLegacyFormat);
        let other = SigningKey::read_pkcs12(b"not a keystore", "password", None).unwrap_err();
        assert_eq!(other.code, ErrorCode::SigningKeyInvalid);
    }

    #[test]
    fn debug_and_empty_names_use_the_application_id() {
        let subject = common_name_subject(" android debug ", "com.example.game").unwrap();
        assert_eq!(subject.to_string(), "CN=com.example.game");
        let subject = common_name_subject("A, \"quoted\" + name", "com.example.game").unwrap();
        assert!(subject.to_string().contains("quoted"));
        let long = "x".repeat(100);
        let subject = common_name_subject(&long, "com.example.game").unwrap();
        assert_eq!(subject.to_string().len(), 3 + 64);
    }

    #[test]
    fn signs_in_place_and_verifies() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("game.apk");
        // Three chunks of entry data, so the digest crosses chunk boundaries.
        let contents: Vec<u8> = (0..(2 * CHUNK_SIZE as usize + 12345))
            .map(|i| (i % 251) as u8)
            .collect();
        write_test_zip(&path, &contents);
        let unsigned = std::fs::read(&path).unwrap();

        let key = test_key();
        sign_apk(&path, key, &|_, _| {}).unwrap();
        let signed = std::fs::read(&path).unwrap();
        assert!(signed.len() > unsigned.len());
        let index = crate::zip::read_index(&mut File::open(&path).unwrap()).unwrap();
        assert!(index.has_apk_signing_block);
        assert_eq!(
            crate::zip::read_entry(
                &mut File::open(&path).unwrap(),
                index.entry("assets/a.bin").unwrap()
            )
            .unwrap(),
            contents
        );
        assert_eq!(
            verify_apk_signature(&path, &|_, _| {}).unwrap(),
            key.certificate_sha256()
        );
        assert_eq!(
            sign_apk(&path, key, &|_, _| {}).unwrap_err().code,
            ErrorCode::ValidationFailed
        );

        // Changing any signed byte breaks verification.
        for position in [
            10,
            CHUNK_SIZE as usize + 7,
            signed.len() - 30,
            signed.len() - 5,
        ] {
            let mut tampered = signed.clone();
            tampered[position] ^= 0x01;
            let tampered_path = dir.path().join("tampered.apk");
            std::fs::write(&tampered_path, &tampered).unwrap();
            assert!(
                verify_apk_signature(&tampered_path, &|_, _| {}).is_err(),
                "byte {position}"
            );
        }
    }

    #[test]
    fn hex_encodes_lowercase() {
        assert_eq!(hex(&[0x00, 0xab, 0xff]), "00abff");
    }

    #[test]
    fn stored_material_round_trips_and_refuses_damage() {
        let key = test_key();
        let material = key.to_material().unwrap();
        assert_eq!(material.certificate_sha256, key.certificate_sha256_hex());
        let json = serde_json::to_value(&material).unwrap();
        assert!(json.get("certificateSha256").is_some());
        assert!(json.get("privateKey").is_some());
        assert!(!format!("{material:?}").contains(&material.private_key));

        let restored = SigningKey::from_material(&material).unwrap();
        assert_eq!(restored.certificate_sha256(), key.certificate_sha256());

        let mut wrong_fingerprint = material.clone();
        wrong_fingerprint.certificate_sha256 = "0".repeat(64);
        assert_eq!(
            SigningKey::from_material(&wrong_fingerprint)
                .unwrap_err()
                .code,
            ErrorCode::SigningKeyInvalid
        );
        let mut damaged = material.clone();
        damaged.private_key = "not base64!".to_string();
        assert_eq!(
            SigningKey::from_material(&damaged).unwrap_err().code,
            ErrorCode::SigningKeyInvalid
        );
        // A damaged private key is invalid, and a readable key of another
        // type is unsupported.
        let mut truncated = material.clone();
        truncated.private_key = BASE64.encode(&BASE64.decode(&material.private_key).unwrap()[..64]);
        assert_eq!(
            SigningKey::from_material(&truncated).unwrap_err().code,
            ErrorCode::SigningKeyInvalid
        );
        let ec_key = PrivateKeyInfo::new(
            rsa::pkcs8::AlgorithmIdentifierRef {
                oid: ObjectIdentifier::new_unwrap("1.2.840.10045.2.1"),
                parameters: None,
            },
            &[1u8; 32],
        )
        .to_der()
        .unwrap();
        let mut unsupported = material.clone();
        unsupported.private_key = BASE64.encode(ec_key);
        assert_eq!(
            SigningKey::from_material(&unsupported).unwrap_err().code,
            ErrorCode::SigningKeyUnsupported
        );
        // A certificate from another key never pairs with this private key.
        let other = SigningKey::generate("Project Two", "com.example.project_two").unwrap();
        let mut mismatched = material.clone();
        mismatched.certificate = other.to_material().unwrap().certificate.clone();
        mismatched.certificate_sha256 = other.certificate_sha256_hex();
        assert_eq!(
            SigningKey::from_material(&mismatched).unwrap_err().code,
            ErrorCode::SigningKeyInvalid
        );
    }

    #[test]
    fn private_files_are_owner_only_and_replace_atomically() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("copy.p12");
        write_private_file(&path, b"first").unwrap();
        write_private_file(&path, b"second").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"second");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o600);
        }
        let leftovers = std::fs::read_dir(dir.path()).unwrap().count();
        assert_eq!(leftovers, 1);
    }
}
