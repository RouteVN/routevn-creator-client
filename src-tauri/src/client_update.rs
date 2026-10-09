use serde::Serialize;
use tauri::{Manager, Webview};
use tauri_plugin_updater::UpdaterExt;
use time::format_description::well_known::Rfc3339;
use url::Url;

use crate::update_device_info::{
    platform_device_language, platform_webview_version, valid_ui_language, valid_webview_version,
};

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
    value.len() == 24
        && value.bytes().all(|byte| {
            matches!(byte, b'1'..=b'9' | b'A'..=b'H' | b'J'..=b'N' | b'P'..=b'Z' | b'a'..=b'k' | b'm'..=b'z')
        })
}

fn valid_device_text(value: &str) -> bool {
    !value.trim().is_empty() && value.chars().count() <= 256 && !value.chars().any(char::is_control)
}

fn valid_ui_language_source(value: &str) -> bool {
    matches!(value, "default" | "selected")
}

fn valid_trigger(value: &str) -> bool {
    matches!(value, "launch" | "periodic" | "manual")
}

// Optional usage fields. The API rejects the whole check when one is present
// but invalid ("a present but invalid optional value fails the check; absent
// stays absent"), so this is the last validation before the network: invalid
// or unreadable values are dropped, never sent.
#[derive(Default)]
struct UsageFields {
    ui_language: Option<String>,
    ui_language_source: Option<String>,
    trigger: Option<String>,
}

fn usage_fields(
    ui_language: Option<String>,
    ui_language_source: Option<String>,
    trigger: Option<String>,
) -> UsageFields {
    UsageFields {
        ui_language: ui_language.filter(|value| valid_ui_language(value)),
        ui_language_source: ui_language_source.filter(|value| valid_ui_language_source(value)),
        trigger: trigger.filter(|value| valid_trigger(value)),
    }
}

// Desktop builds are always the desktop form factor; the device language and
// webview version come from the native shell, not from JavaScript.
fn endpoint_with_device(
    mut endpoint: Url,
    device_id: &str,
    device_model: &str,
    os_version: &str,
    usage: &UsageFields,
) -> Url {
    let webview_version = platform_webview_version();
    // The API rejects the whole check for an invalid value, so the normalized
    // language is checked again here, in release builds too, and anything
    // that slipped through is sent as `unknown`.
    let device_language = Some(platform_device_language())
        .filter(|value| value == "unknown" || valid_ui_language(value))
        .unwrap_or_else(|| "unknown".to_owned());
    let mut pairs = vec![
        ("device.id", device_id),
        ("device.model", device_model),
        ("device.osVersion", os_version),
        ("device.formFactor", "desktop"),
        ("device.language", device_language.as_str()),
    ];
    if let Some(webview_version) = webview_version
        .as_deref()
        .filter(|value| valid_webview_version(value))
    {
        pairs.push(("device.webViewVersion", webview_version));
    }
    if let Some(ui_language) = usage.ui_language.as_deref() {
        pairs.push(("uiLanguage", ui_language));
    }
    if let Some(ui_language_source) = usage.ui_language_source.as_deref() {
        pairs.push(("uiLanguageSource", ui_language_source));
    }
    if let Some(trigger) = usage.trigger.as_deref() {
        pairs.push(("trigger", trigger));
    }
    append_query_pairs(&mut endpoint, &pairs);
    endpoint
}

// The API percent-decodes the query once and keeps `+` literally, so a form
// encoder's `+` for a space would arrive as a `+`. Spaces go out as `%20`.
fn append_query_pairs(endpoint: &mut Url, pairs: &[(&str, &str)]) {
    // The form encoder writes a literal `+` as `%2B`, so each `+` it outputs
    // stands for a space.
    let encode = |value: &str| {
        url::form_urlencoded::byte_serialize(value.as_bytes())
            .collect::<String>()
            .replace('+', "%20")
    };
    let mut query = endpoint.query().unwrap_or_default().to_owned();
    for (key, value) in pairs {
        if !query.is_empty() {
            query.push('&');
        }
        query.push_str(&encode(key));
        query.push('=');
        query.push_str(&encode(value));
    }
    endpoint.set_query(Some(&query));
}

#[tauri::command]
pub async fn check_client_update(
    webview: Webview,
    device_id: String,
    device_model: String,
    os_version: String,
    ui_language: Option<String>,
    ui_language_source: Option<String>,
    trigger: Option<String>,
) -> Result<Option<ClientUpdateMetadata>, String> {
    if !valid_device_id(&device_id)
        || !valid_device_text(&device_model)
        || !valid_device_text(&os_version)
    {
        return Err("Invalid update device metadata".to_string());
    }
    let usage = usage_fields(ui_language, ui_language_source, trigger);

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
        .map(|endpoint| {
            endpoint_with_device(endpoint, &device_id, &device_model, &os_version, &usage)
        })
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

    // Decodes the query as the API does: percent-decoded once, with `+` kept
    // literally rather than read as a space.
    fn query_pairs(endpoint: &Url) -> Vec<(String, String)> {
        let query = endpoint.query().unwrap_or_default().replace('+', "%2B");
        url::form_urlencoded::parse(query.as_bytes())
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect()
    }

    fn pair_value<'a>(query: &'a [(String, String)], key: &str) -> Option<&'a str> {
        query
            .iter()
            .find(|(candidate, _)| candidate == key)
            .map(|(_, value)| value.as_str())
    }

    #[test]
    fn appends_encoded_device_query_without_changing_updater_placeholders() {
        let endpoint = Url::parse("https://api1.routevn.com/system/updates/v1/routevn-creator/tauri?currentVersion={{current_version}}&target={{target}}&arch={{arch}}&bundleType={{bundle_type}}").unwrap();
        let usage = UsageFields {
            ui_language: Some("ja".to_string()),
            ui_language_source: Some("selected".to_string()),
            trigger: Some("manual".to_string()),
        };
        let endpoint = endpoint_with_device(
            endpoint,
            "123456789ABC123456789ABC",
            "メーカー Model / Pro",
            "Windows 24H2 (build 26100)",
            &usage,
        );
        let query = query_pairs(&endpoint);
        assert_eq!(
            pair_value(&query, "currentVersion"),
            Some("{{current_version}}")
        );
        assert_eq!(pair_value(&query, "bundleType"), Some("{{bundle_type}}"));
        assert_eq!(
            pair_value(&query, "device.id"),
            Some("123456789ABC123456789ABC")
        );
        assert_eq!(
            pair_value(&query, "device.model"),
            Some("メーカー Model / Pro")
        );
        assert_eq!(
            pair_value(&query, "device.osVersion"),
            Some("Windows 24H2 (build 26100)")
        );
        assert_eq!(pair_value(&query, "device.formFactor"), Some("desktop"));
        // Runs on the test host OS, so only shape can be asserted for the
        // natively read values.
        let language = pair_value(&query, "device.language").unwrap();
        assert!(language == "unknown" || valid_ui_language(language));
        if let Some(version) = pair_value(&query, "device.webViewVersion") {
            assert!(valid_webview_version(version));
        } // Absent on macOS, which omits the field entirely.
        assert_eq!(pair_value(&query, "uiLanguage"), Some("ja"));
        assert_eq!(pair_value(&query, "uiLanguageSource"), Some("selected"));
        assert_eq!(pair_value(&query, "trigger"), Some("manual"));
    }

    #[test]
    fn encodes_spaces_as_percent_20_and_plus_as_percent_2b() {
        let endpoint =
            Url::parse("https://api1.routevn.com/system/updates/v1/routevn-creator/tauri").unwrap();
        let endpoint = endpoint_with_device(
            endpoint,
            "123456789ABC123456789ABC",
            "Model+ Pro",
            "macOS 27.0",
            &usage_fields(None, None, None),
        );
        let raw = endpoint.query().unwrap();
        assert!(raw.contains("device.model=Model%2B%20Pro"), "{raw}");
        assert!(raw.contains("device.osVersion=macOS%2027.0"), "{raw}");
        assert!(!raw.contains('+'), "{raw}");
        let query = query_pairs(&endpoint);
        assert_eq!(pair_value(&query, "device.model"), Some("Model+ Pro"));
        assert_eq!(pair_value(&query, "device.osVersion"), Some("macOS 27.0"));
    }

    #[test]
    fn omits_invalid_or_absent_optional_usage_fields() {
        let endpoint =
            Url::parse("https://api1.routevn.com/system/updates/v1/routevn-creator/tauri").unwrap();
        let usage = usage_fields(
            Some("en-US".to_string()),
            Some("guesswork".to_string()),
            Some("background".to_string()),
        );
        let endpoint = endpoint_with_device(
            endpoint,
            "123456789ABC123456789ABC",
            "Example Model",
            "Linux 6.8",
            &usage,
        );
        let query = query_pairs(&endpoint);
        assert_eq!(pair_value(&query, "uiLanguage"), None);
        assert_eq!(pair_value(&query, "uiLanguageSource"), None);
        assert_eq!(pair_value(&query, "trigger"), None);

        let default_usage = usage_fields(None, None, None);
        let endpoint = endpoint_with_device(
            Url::parse("https://api1.routevn.com/system/updates/v1/routevn-creator/tauri").unwrap(),
            "123456789ABC123456789ABC",
            "Example Model",
            "Linux 6.8",
            &default_usage,
        );
        let query = query_pairs(&endpoint);
        assert_eq!(pair_value(&query, "uiLanguage"), None);
        assert_eq!(pair_value(&query, "uiLanguageSource"), None);
        assert_eq!(pair_value(&query, "trigger"), None);
        assert_eq!(pair_value(&query, "device.formFactor"), Some("desktop"));
    }

    #[test]
    fn validates_usage_field_enums() {
        for value in ["launch", "periodic", "manual"] {
            assert!(valid_trigger(value));
        }
        assert!(!valid_trigger("watch"));
        for value in ["default", "selected"] {
            assert!(valid_ui_language_source(value));
        }
        assert!(!valid_ui_language_source("auto"));
        let usage = usage_fields(
            Some("zh-hans".to_string()),
            Some("default".to_string()),
            Some("launch".to_string()),
        );
        assert_eq!(usage.ui_language.as_deref(), Some("zh-hans"));
        assert_eq!(usage.ui_language_source.as_deref(), Some("default"));
        assert_eq!(usage.trigger.as_deref(), Some("launch"));
    }

    #[test]
    fn rejects_invalid_device_metadata() {
        assert!(valid_device_id("123456789ABC123456789ABC"));
        assert!(!valid_device_id("123456789ABC"));
        assert!(!valid_device_id("123456789ABCDEFG"));
        assert!(!valid_device_id(&"1".repeat(23)));
        assert!(!valid_device_id(&"1".repeat(25)));
        assert!(!valid_device_id("123456789ABC123456789AB\n"));
        assert!(!valid_device_id("O23456789ABC123456789ABC"));
        assert!(!valid_device_id("000000000000"));
        assert!(!valid_device_id("123456789AB"));
        assert!(valid_device_text("メーカー Model / Pro"));
        assert!(!valid_device_text(" \t "));
        assert!(!valid_device_text("Model\nName"));
        assert!(!valid_device_text(&"x".repeat(257)));
    }
}
