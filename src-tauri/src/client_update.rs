use serde::Serialize;
use tauri::{Manager, Webview};
use tauri_plugin_updater::UpdaterExt;
use time::format_description::well_known::Rfc3339;
use url::Url;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientUpdateMetadata {
    rid: u32,
    current_version: String,
    version: String,
    date: Option<String>,
    body: Option<String>,
    raw_json: serde_json::Value,
}

fn valid_device_id(value: &str) -> bool {
    value.len() == 12
        && value.bytes().all(|byte| {
            matches!(byte, b'1'..=b'9' | b'A'..=b'H' | b'J'..=b'N' | b'P'..=b'Z' | b'a'..=b'k' | b'm'..=b'z')
        })
}

fn valid_device_text(value: &str) -> bool {
    !value.trim().is_empty() && value.chars().count() <= 256 && !value.chars().any(char::is_control)
}

fn endpoint_with_device(
    mut endpoint: Url,
    device_id: &str,
    device_model: &str,
    os_version: &str,
) -> Url {
    endpoint
        .query_pairs_mut()
        .append_pair("device.id", device_id)
        .append_pair("device.model", device_model)
        .append_pair("device.osVersion", os_version);
    endpoint
}

#[tauri::command]
pub async fn check_client_update(
    webview: Webview,
    device_id: String,
    device_model: String,
    os_version: String,
) -> Result<Option<ClientUpdateMetadata>, String> {
    if !valid_device_id(&device_id)
        || !valid_device_text(&device_model)
        || !valid_device_text(&os_version)
    {
        return Err("Invalid update device metadata".to_string());
    }

    // Use the active Tauri configuration, including its production/development
    // endpoint and signing key. Only the endpoint receives runtime query data.
    let config = webview
        .config()
        .plugins
        .0
        .get("updater")
        .ok_or("Updater configuration is missing")?;
    let updater_config: tauri_plugin_updater::Config =
        serde_json::from_value(config.clone()).map_err(|error| error.to_string())?;
    let endpoints = updater_config
        .endpoints
        .into_iter()
        .map(|endpoint| endpoint_with_device(endpoint, &device_id, &device_model, &os_version))
        .collect();

    let builder = webview
        .updater_builder()
        .endpoints(endpoints)
        .map_err(|error| error.to_string())?
        .timeout(std::time::Duration::from_secs(10));
    #[cfg(target_os = "macos")]
    let builder = builder.target("macos-universal");

    let update = builder
        .build()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?;
    let Some(update) = update else {
        return Ok(None);
    };

    let metadata = ClientUpdateMetadata {
        current_version: update.current_version.clone(),
        version: update.version.clone(),
        date: update
            .date
            .map(|date| date.format(&Rfc3339).map_err(|error| error.to_string()))
            .transpose()?,
        body: update.body.clone(),
        raw_json: update.raw_json.clone(),
        rid: webview.resources_table().add(update),
    };
    Ok(Some(metadata))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn appends_encoded_device_query_without_changing_updater_placeholders() {
        let endpoint = Url::parse("https://api1.routevn.com/system/updates/v1/routevn-creator/tauri?currentVersion={{current_version}}&target={{target}}&arch={{arch}}&bundleType={{bundle_type}}").unwrap();
        let endpoint = endpoint_with_device(
            endpoint,
            "123456789ABC",
            "メーカー Model / Pro",
            "Windows 24H2 (build 26100)",
        );
        let query: Vec<_> = endpoint.query_pairs().collect();
        assert!(
            query
                .iter()
                .any(|(key, value)| key == "currentVersion" && value == "{{current_version}}")
        );
        assert!(
            query
                .iter()
                .any(|(key, value)| key == "bundleType" && value == "{{bundle_type}}")
        );
        assert!(
            query
                .iter()
                .any(|(key, value)| key == "device.id" && value == "123456789ABC")
        );
        assert!(
            query
                .iter()
                .any(|(key, value)| key == "device.model" && value == "メーカー Model / Pro")
        );
        assert!(
            query
                .iter()
                .any(|(key, value)| key == "device.osVersion"
                    && value == "Windows 24H2 (build 26100)")
        );
    }

    #[test]
    fn rejects_invalid_device_metadata() {
        assert!(valid_device_id("123456789ABC"));
        assert!(!valid_device_id("000000000000"));
        assert!(!valid_device_id("123456789AB"));
        assert!(valid_device_text("メーカー Model / Pro"));
        assert!(!valid_device_text(" \t "));
        assert!(!valid_device_text("Model\nName"));
        assert!(!valid_device_text(&"x".repeat(257)));
    }
}
