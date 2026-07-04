use serde::{Deserialize, Serialize};
use std::time::Duration;
use url::Url;

const UPDATE_MANIFEST_URL: &str =
    "https://static-1.routevn.com/routevn-creator-client/latestv1.json";
const UPDATE_TARGET: &str = "linux";
const UPDATE_ARCH: &str = "x86_64";

#[derive(Debug, Deserialize)]
struct UpdateManifest {
    version: Option<String>,
    pub_date: Option<String>,
    date: Option<String>,
    notes: Option<String>,
    body: Option<String>,
    #[serde(rename = "manualDownloadUrl")]
    manual_download_url: Option<String>,
    platforms: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualUpdateManifest {
    version: String,
    date: Option<String>,
    body: Option<String>,
    manual_download_url: Option<String>,
    platforms: Option<serde_json::Value>,
}

fn install_rustls_provider() {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
}

fn build_manifest_url(current_version: &str) -> Result<Url, String> {
    let mut url = Url::parse(UPDATE_MANIFEST_URL).map_err(|error| error.to_string())?;
    url.query_pairs_mut()
        .append_pair("target", UPDATE_TARGET)
        .append_pair("arch", UPDATE_ARCH)
        .append_pair("currentVersion", current_version);
    Ok(url)
}

#[tauri::command]
pub async fn fetch_manual_update_manifest(
    current_version: String,
) -> Result<ManualUpdateManifest, String> {
    install_rustls_provider();
    let manifest_url = build_manifest_url(&current_version)?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .get(manifest_url)
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
        manual_download_url: manifest.manual_download_url,
        platforms: manifest.platforms,
    })
}
