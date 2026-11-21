//! Exports through the JSON interface the Android and iOS Creator apps call,
//! with the committed templates and a key made through the same interface.

mod common;

use std::path::Path;

use common::template_dir;
use routevn_android_export::{host, signing};
use serde_json::{Value, json};

fn value(json: String) -> Value {
    serde_json::from_str(&json).unwrap()
}

fn export_request(work: &Path, template: &str, descriptor: &str, output: &str) -> Option<Value> {
    let dir = template_dir();
    if !dir.join(template).is_file() {
        eprintln!("Skipping: no Android player template {template}");
        return None;
    }
    // The shared request writes the icon and the asset this one names.
    let shared = common::request(work, &dir.join(template), &dir.join(descriptor));
    Some(json!({
        "templatePath": dir.join(template),
        "descriptorPath": dir.join(descriptor),
        "outputPath": work.join(output),
        "assets": [{
            "id": "asset-1",
            "path": work.join("asset.bin"),
            "mime": "application/octet-stream"
        }],
        "instructionsJson": shared.instructions_json,
        "applicationId": "com.example.game_one",
        "applicationName": "Game One",
        "versionName": "1.2.3",
        "versionCode": 42,
        "orientation": "portrait",
        "iconPath": shared.icon_path,
        "iconBackgroundColor": "#12AB34",
        "splashBackgroundColor": "#000000",
        "workDir": work
    }))
}

fn create_key() -> Value {
    let created = value(host::create_signing_key(
        r#"{"applicationName":"Game One","applicationId":"com.example.game_one"}"#,
    ));
    assert_eq!(created["ok"], true);
    created["result"].clone()
}

#[test]
fn exports_a_signed_and_an_unsigned_apk() {
    let work = tempfile::tempdir().unwrap();
    let Some(mut request) = export_request(
        work.path(),
        "RouteVNPlayerTemplate.apk",
        "RouteVNPlayerTemplate.json",
        "Game One-1.2.3.apk",
    ) else {
        return;
    };

    let unsigned = value(host::export_apk(&request.to_string(), None));
    assert_eq!(unsigned["ok"], true, "{unsigned}");
    assert!(unsigned["result"]["signingCertificateSha256"].is_null());
    assert!(
        signing::verify_apk_signature(&work.path().join("Game One-1.2.3.apk"), &|_, _| {}).is_err()
    );

    let key = create_key();
    request["signingKey"] = key.clone();
    let phases = std::sync::Mutex::new(Vec::new());
    let on_progress = |progress: routevn_exporter::ZipExportProgress| {
        let mut phases = phases.lock().unwrap();
        if phases.last() != Some(&progress.phase) {
            phases.push(progress.phase);
        }
    };
    let signed = value(host::export_apk(&request.to_string(), Some(&on_progress)));
    assert_eq!(signed["ok"], true, "{signed}");
    assert_eq!(
        signed["result"]["signingCertificateSha256"],
        key["certificateSha256"]
    );
    let certificate =
        signing::verify_apk_signature(&work.path().join("Game One-1.2.3.apk"), &|_, _| {}).unwrap();
    assert_eq!(signing::hex(&certificate), key["certificateSha256"]);
    assert!(
        phases
            .lock()
            .unwrap()
            .iter()
            .any(|phase| phase == "signApk")
    );
}

#[test]
fn exports_a_signed_bundle() {
    let work = tempfile::tempdir().unwrap();
    let Some(mut request) = export_request(
        work.path(),
        "RouteVNPlayerTemplate.aab",
        "RouteVNPlayerTemplate.aab.json",
        "Game One-1.2.3.aab",
    ) else {
        return;
    };
    let key = create_key();
    request["signingKey"] = key.clone();
    let exported = value(host::export_app_bundle(&request.to_string(), None));
    assert_eq!(exported["ok"], true, "{exported}");
    assert_eq!(
        exported["result"]["signingCertificateSha256"],
        key["certificateSha256"]
    );
    let bytes = std::fs::metadata(work.path().join("Game One-1.2.3.aab"))
        .unwrap()
        .len();
    assert_eq!(exported["result"]["bundleBytes"], bytes);
}
