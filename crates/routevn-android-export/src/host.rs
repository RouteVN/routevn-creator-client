//! The JSON interface of the exporter for hosts that reach it through a
//! foreign-function bridge: the Android and iOS Creator apps. Every function
//! takes a JSON request and returns `{"ok":true,"result":...}` or
//! `{"ok":false,"error":{"code":string,"message":string}}`, and never
//! panics across the bridge.
//!
//! The project stores its signing keys; these functions only make, read, and
//! encode keys and sign with the key a request carries.

use std::panic::{AssertUnwindSafe, catch_unwind};

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use routevn_exporter::ZipExportProgressCallback;
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

use crate::{AndroidExportRequest, ErrorCode, ExportError, Result, SigningKey, SigningKeyMaterial};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Response<T: Serialize> {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ExportError>,
}

fn failure(error: ExportError) -> String {
    serde_json::to_string(&Response::<()> {
        ok: false,
        result: None,
        error: Some(error),
    })
    .unwrap_or_else(|_| {
        r#"{"ok":false,"error":{"code":"write-failed","message":"The Android exporter failed."}}"#
            .to_string()
    })
}

/// The JSON response for a failed call, for hosts that fail before they can
/// build a request.
pub fn error_response(code: ErrorCode, message: &str) -> String {
    failure(ExportError::new(code, message))
}

fn respond<T: Serialize>(unexpected: ErrorCode, task: impl FnOnce() -> Result<T>) -> String {
    match catch_unwind(AssertUnwindSafe(task)) {
        Ok(Ok(result)) => serde_json::to_string(&Response {
            ok: true,
            result: Some(result),
            error: None,
        })
        .unwrap_or_else(|error| {
            failure(ExportError::write(format!(
                "Failed to encode the result: {error}"
            )))
        }),
        Ok(Err(error)) => failure(error),
        Err(_) => failure(ExportError::new(
            unexpected,
            "The Android exporter failed unexpectedly.",
        )),
    }
}

fn parse<'a, T: Deserialize<'a>>(request_json: &'a str) -> Result<T> {
    serde_json::from_str(request_json)
        .map_err(|error| ExportError::invalid_request(format!("Invalid request: {error}")))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateSigningKeyRequest {
    application_name: String,
    application_id: String,
}

/// Create Key: `{applicationName, applicationId}` to a new key's
/// `SigningKeyMaterial`.
pub fn create_signing_key(request_json: &str) -> String {
    respond(ErrorCode::SigningFailed, || {
        let request: CreateSigningKeyRequest = parse(request_json)?;
        SigningKey::generate(&request.application_name, &request.application_id)?.to_material()
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadKeystoreRequest {
    /// The PKCS #12 keystore file in base64.
    keystore: String,
    password: String,
    #[serde(default)]
    alias: Option<String>,
}

/// Upload Key: `{keystore, password, alias?}` to the `SigningKeyMaterial` of
/// the key in a PKCS #12 keystore.
pub fn read_keystore(request_json: &str) -> String {
    respond(ErrorCode::SigningFailed, || {
        let request: ReadKeystoreRequest = parse(request_json)?;
        let password = Zeroizing::new(request.password);
        let keystore = Zeroizing::new(BASE64.decode(request.keystore.trim()).map_err(|_| {
            ExportError::new(
                ErrorCode::SigningKeyInvalid,
                "The keystore file could not be read.",
            )
        })?);
        SigningKey::read_pkcs12(&keystore, &password, request.alias.as_deref())?.to_material()
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncodeKeystoreRequest {
    key: SigningKeyMaterial,
    password: String,
    alias: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EncodedKeystore {
    /// The PKCS #12 keystore file in base64.
    keystore: String,
}

impl Drop for EncodedKeystore {
    fn drop(&mut self) {
        zeroize::Zeroize::zeroize(&mut self.keystore);
    }
}

/// Save a Copy: `{key, password, alias}` to a password-protected PKCS #12
/// keystore, which the host writes where the creator chose.
pub fn encode_keystore(request_json: &str) -> String {
    respond(ErrorCode::SigningFailed, || {
        let request: EncodeKeystoreRequest = parse(request_json)?;
        let password = Zeroizing::new(request.password);
        let key = SigningKey::from_material(&request.key)?;
        let keystore = Zeroizing::new(key.to_pkcs12(&password, &request.alias)?);
        Ok(EncodedKeystore {
            keystore: BASE64.encode(keystore.as_slice()),
        })
    })
}

/// An export request with the project key that signs it.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignedExportRequest {
    #[serde(flatten)]
    request: AndroidExportRequest,
    #[serde(default)]
    signing_key: Option<SigningKeyMaterial>,
}

/// Exports an APK from the `AndroidExportRequest` fields, signed with
/// `signingKey` when the request has one, or unsigned.
pub fn export_apk(
    request_json: &str,
    on_progress: Option<&ZipExportProgressCallback<'_>>,
) -> String {
    respond(ErrorCode::WriteFailed, || {
        let SignedExportRequest {
            request,
            signing_key,
        } = parse(request_json)?;
        let signing_key = signing_key
            .as_ref()
            .map(SigningKey::from_material)
            .transpose()?;
        crate::export_android_apk_with_key(&request, signing_key.as_ref(), on_progress)
    })
}

/// Exports an App Bundle from the `AndroidExportRequest` fields, signed with
/// the required `signingKey`.
pub fn export_app_bundle(
    request_json: &str,
    on_progress: Option<&ZipExportProgressCallback<'_>>,
) -> String {
    respond(ErrorCode::WriteFailed, || {
        let SignedExportRequest {
            request,
            signing_key,
        } = parse(request_json)?;
        let signing_key = signing_key.ok_or_else(|| {
            ExportError::invalid_request("An Android App Bundle needs a signing key.")
        })?;
        let signing_key = SigningKey::from_material(&signing_key)?;
        crate::export_android_app_bundle(&request, &signing_key, on_progress)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn value(json: String) -> serde_json::Value {
        serde_json::from_str(&json).unwrap()
    }

    #[test]
    fn makes_a_key_saves_a_copy_and_reads_it_back() {
        let created = value(create_signing_key(
            r#"{"applicationName":"Project One","applicationId":"com.example.project_one"}"#,
        ));
        assert_eq!(created["ok"], true);
        let key = created["result"].clone();
        assert_eq!(key["certificateSha256"].as_str().unwrap().len(), 64);

        let encoded = value(encode_keystore(
            &serde_json::json!({ "key": key, "password": "secret-1", "alias": "key0" }).to_string(),
        ));
        assert_eq!(encoded["ok"], true);
        let keystore = encoded["result"]["keystore"].as_str().unwrap();

        let read = value(read_keystore(
            &serde_json::json!({ "keystore": keystore, "password": "secret-1" }).to_string(),
        ));
        assert_eq!(read["ok"], true);
        assert_eq!(read["result"], key);

        let wrong = value(read_keystore(
            &serde_json::json!({ "keystore": keystore, "password": "wrong-password" }).to_string(),
        ));
        assert_eq!(wrong["ok"], false);
        assert_eq!(wrong["error"]["code"], "keystore-password-incorrect");

        let missing = value(read_keystore(
            &serde_json::json!({
                "keystore": keystore,
                "password": "secret-1",
                "alias": "other"
            })
            .to_string(),
        ));
        assert_eq!(missing["error"]["code"], "keystore-alias-not-found");
    }

    #[test]
    fn reports_bad_requests_with_codes() {
        assert_eq!(
            value(create_signing_key("{not json"))["error"]["code"],
            "invalid-request"
        );
        assert_eq!(
            value(read_keystore(
                r#"{"keystore":"not base64!","password":"secret-1"}"#
            ))["error"]["code"],
            "signing-key-invalid"
        );
        assert_eq!(
            value(export_apk("{}", None))["error"]["code"],
            "invalid-request"
        );
        assert_eq!(
            value(error_response(ErrorCode::WriteFailed, "Failed."))["error"]["message"],
            "Failed."
        );
    }

    #[test]
    fn a_bundle_export_needs_a_signing_key() {
        let work = tempfile::tempdir().unwrap();
        let request = serde_json::json!({
            "templatePath": work.path().join("t.aab"),
            "descriptorPath": work.path().join("t.aab.json"),
            "outputPath": work.path().join("out.aab"),
            "assets": [],
            "instructionsJson": "{}",
            "applicationId": "com.example.project_one",
            "applicationName": "Project One",
            "versionName": "1.0.0",
            "versionCode": 1,
            "orientation": "landscape",
            "iconPath": work.path().join("icon.png"),
            "iconBackgroundColor": "#FFFFFF",
            "splashBackgroundColor": "#000000"
        });
        let response = value(export_app_bundle(&request.to_string(), None));
        assert_eq!(response["ok"], false);
        assert_eq!(response["error"]["code"], "invalid-request");
        assert!(
            response["error"]["message"]
                .as_str()
                .unwrap()
                .contains("signing key")
        );
    }
}
