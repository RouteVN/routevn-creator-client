use std::fmt;

use serde::Serialize;

/// Stable error categories. Hosts map these to localized messages and append
/// the technical message as details.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ErrorCode {
    InvalidRequest,
    TemplateMissing,
    TemplateInvalid,
    IconInvalid,
    PackageFailed,
    TooLarge,
    WriteFailed,
    ValidationFailed,
    /// Creating or using a key failed unexpectedly.
    SigningFailed,
    /// The file is not a keystore with a usable key and certificate, or a
    /// stored key is damaged.
    SigningKeyInvalid,
    /// The key is not RSA, or has fewer than 2048 bits.
    SigningKeyUnsupported,
    KeystorePasswordIncorrect,
    /// A legacy JKS or JCEKS keystore, which must be converted to PKCS #12.
    KeystoreLegacyFormat,
    /// The keystore holds several keys and no alias was given.
    KeystoreAliasRequired,
    KeystoreAliasNotFound,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportError {
    pub code: ErrorCode,
    pub message: String,
}

impl ExportError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn invalid_request(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::InvalidRequest, message)
    }

    pub fn template(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::TemplateInvalid, message)
    }

    pub fn write(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::WriteFailed, message)
    }

    pub fn validation(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::ValidationFailed, message)
    }
}

impl fmt::Display for ExportError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for ExportError {}

pub type Result<T> = std::result::Result<T, ExportError>;
