use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Deserialize)]
struct UpdateManifest {
    version: Option<String>,
    pub_date: Option<String>,
    date: Option<String>,
    notes: Option<String>,
    body: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualUpdateManifest {
    version: String,
    date: Option<String>,
    body: Option<String>,
}

fn install_rustls_provider() {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
}

#[tauri::command]
pub async fn fetch_manual_update_manifest(url: String) -> Result<ManualUpdateManifest, String> {
    install_rustls_provider();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("Update manifest request failed: {status}"));
    }

    let manifest = response
        .json::<UpdateManifest>()
        .await
        .map_err(|error| error.to_string())?;
    let version = manifest.version.unwrap_or_default();
    if version.trim().is_empty() {
        return Err("Update manifest is missing a version.".to_string());
    }

    Ok(ManualUpdateManifest {
        version,
        date: manifest.pub_date.or(manifest.date),
        body: manifest.notes.or(manifest.body),
    })
}
