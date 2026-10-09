use serde::Serialize;

const MAX_METADATA_CHARS: usize = 256;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDeviceInfo {
    device_model: String,
    os_version: String,
}

// Query only model/version fields, never computer names, serials, or hardware IDs.
fn metadata_text(value: Option<String>) -> String {
    let value = value.unwrap_or_default();
    let cleaned = value.trim();
    if cleaned.is_empty()
        || cleaned.encode_utf16().count() > MAX_METADATA_CHARS
        || cleaned.chars().any(char::is_control)
    {
        "unknown".to_string()
    } else {
        cleaned.to_string()
    }
}

#[cfg(target_os = "linux")]
fn bounded_file(path: &str, limit: u64) -> Option<String> {
    use std::io::Read;
    let mut value = String::new();
    std::fs::File::open(path)
        .ok()?
        .take(limit)
        .read_to_string(&mut value)
        .ok()?;
    Some(value)
}

#[cfg(target_os = "linux")]
fn platform_device_info() -> (Option<String>, Option<String>) {
    let manufacturer = bounded_file("/sys/class/dmi/id/sys_vendor", 1024);
    let model = bounded_file("/sys/class/dmi/id/product_name", 1024)
        .or_else(|| bounded_file("/proc/device-tree/model", 1024));
    let device_model = model.map(|model| {
        format!(
            "{} {}",
            manufacturer.unwrap_or_default().trim(),
            model.trim_matches('\0').trim()
        )
    });
    let os_version = bounded_file("/proc/sys/kernel/osrelease", 1024)
        .map(|version| format!("Linux {}", version.trim()));
    (device_model, os_version)
}

#[cfg(target_os = "macos")]
fn sysctl_text(name: &std::ffi::CStr) -> Option<String> {
    use std::ffi::{c_char, c_int, c_void};
    unsafe extern "C" {
        fn sysctlbyname(
            name: *const c_char,
            oldp: *mut c_void,
            oldlenp: *mut usize,
            newp: *mut c_void,
            newlen: usize,
        ) -> c_int;
    }
    let mut bytes = [0_u8; 1024];
    let mut length = bytes.len();
    // SAFETY: name is NUL-terminated, the destination is length bytes, and
    // null newp with newlen=0 performs a read without mutating system settings.
    let status = unsafe {
        sysctlbyname(
            name.as_ptr(),
            bytes.as_mut_ptr().cast(),
            &mut length,
            std::ptr::null_mut(),
            0,
        )
    };
    if status != 0 || length > bytes.len() {
        return None;
    }
    std::str::from_utf8(&bytes[..length])
        .ok()
        .map(|value| value.trim_end_matches('\0').to_string())
}

#[cfg(target_os = "macos")]
fn platform_device_info() -> (Option<String>, Option<String>) {
    let os_version = sysctl_text(c"kern.osproductversion")
        .map(|version| format!("macOS {version}"))
        .or_else(|| sysctl_text(c"kern.osrelease").map(|version| format!("Darwin {version}")));
    (sysctl_text(c"hw.model"), os_version)
}

#[cfg(target_os = "windows")]
fn registry_text(path: &str, name: &str) -> Option<String> {
    use windows::Win32::System::Registry::{
        HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ, RRF_SUBKEY_WOW6464KEY, RegGetValueW,
    };
    use windows::core::PCWSTR;
    let path: Vec<u16> = path.encode_utf16().chain(Some(0)).collect();
    let name: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
    let mut buffer = [0_u16; 1024];
    let mut byte_length = std::mem::size_of_val(&buffer) as u32;
    // SAFETY: input strings are NUL-terminated and the writable buffer matches
    // byte_length. RRF_RT_REG_SZ restricts the result to a UTF-16 string.
    let status = unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            PCWSTR(path.as_ptr()),
            PCWSTR(name.as_ptr()),
            RRF_RT_REG_SZ | RRF_SUBKEY_WOW6464KEY,
            None,
            Some(buffer.as_mut_ptr().cast()),
            Some(&mut byte_length),
        )
    };
    if status.is_err() || byte_length as usize > std::mem::size_of_val(&buffer) {
        return None;
    }
    let end = buffer.iter().position(|value| *value == 0)?;
    String::from_utf16(&buffer[..end]).ok()
}

#[cfg(target_os = "windows")]
fn platform_device_info() -> (Option<String>, Option<String>) {
    const BIOS: &str = r"HARDWARE\DESCRIPTION\System\BIOS";
    const VERSION: &str = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion";
    let model = registry_text(BIOS, "SystemProductName");
    let device_model = model.map(|model| {
        format!(
            "{} {model}",
            registry_text(BIOS, "SystemManufacturer").unwrap_or_default()
        )
    });
    let os_version =
        registry_text(VERSION, "CurrentBuildNumber").map(|build| {
            match registry_text(VERSION, "DisplayVersion") {
                Some(version) => format!("Windows {version} (build {build})"),
                None => format!("Windows build {build}"),
            }
        });
    (device_model, os_version)
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn platform_device_info() -> (Option<String>, Option<String>) {
    (None, None)
}

// ---------------------------------------------------------------------------
// Update-check usage fields (device.language, device.webViewVersion).
//
// The API rejects the whole update check when an optional field is present
// but invalid, so every value is validated here and omitted otherwise. The
// language rules mirror src/internal/updateUsage.js exactly.
// ---------------------------------------------------------------------------

fn is_ascii_lowercase(part: &str) -> bool {
    !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_lowercase())
}

pub fn valid_ui_language(value: &str) -> bool {
    let mut parts = value.split('-');
    let language = parts.next().unwrap_or_default();
    let script = parts.next();
    if !is_ascii_lowercase(language) || !(2..=3).contains(&language.len()) {
        return false;
    }
    match script {
        None => parts.next().is_none(),
        Some(script) => is_ascii_lowercase(script) && script.len() == 4 && parts.next().is_none(),
    }
}

fn chinese_script_for_region(region: &str) -> Option<&'static str> {
    match region {
        "cn" | "sg" => Some("hans"),
        "tw" | "hk" | "mo" => Some("hant"),
        _ => None,
    }
}

// A single letter or digit starts an extension or private-use block; no
// region or script subtag appears after it.
fn is_singleton_subtag(part: &str) -> bool {
    part.len() == 1
        && part
            .chars()
            .all(|character| character.is_ascii_alphanumeric())
}

/// Lowercase language with no region or extensions; only Chinese keeps a
/// script. Anything unreadable becomes "unknown", which the API accepts only
/// for device.language.
pub fn normalize_device_language(raw: Option<&str>) -> String {
    let Some(raw) = raw.map(str::trim).filter(|value| !value.is_empty()) else {
        return "unknown".to_string();
    };
    let lowercase = raw.to_lowercase();
    let parts: Vec<&str> = lowercase
        .split(['-', '_'])
        .filter(|part| !part.is_empty())
        .collect();
    let Some(&language) = parts.first() else {
        return "unknown".to_string();
    };
    if !is_ascii_lowercase(language) || !(2..=3).contains(&language.len()) {
        return "unknown".to_string();
    }
    if language != "zh" {
        return language.to_string();
    }
    let second = parts.get(1).copied().unwrap_or_default();
    if second == "hans" || second == "hant" {
        return format!("zh-{second}");
    }
    let extension_start = parts.iter().skip(1).copied().position(is_singleton_subtag);
    let known_parts = match extension_start {
        Some(index) => &parts[..index + 1],
        None => &parts[..],
    };
    if !is_ascii_lowercase(second) || second.len() != 4 {
        if let Some(script) = chinese_script_for_region(second) {
            return format!("zh-{script}");
        }
        let region = known_parts
            .iter()
            .skip(1)
            .find(|part| is_ascii_lowercase(part) && part.len() == 2);
        if let Some(script) = region.and_then(|region| chinese_script_for_region(region)) {
            return format!("zh-{script}");
        }
    }
    "zh-hans".to_string()
}

pub fn valid_webview_version(value: &str) -> bool {
    let mut parts = value.split('.');
    let part = parts.next().unwrap_or_default();
    let all_numeric = |part: &str| {
        (1..=4).contains(&part.len()) && part.bytes().all(|byte| byte.is_ascii_digit())
    };
    all_numeric(part)
        && parts
            .next()
            .is_none_or(|minor| all_numeric(minor) && parts.next().is_none())
}

/// The engine version the update API groups on: the Chromium major on
/// Windows ("128.0.2739.79" -> "128") and WebKitGTK major.minor on Linux
/// ("2.46.7" -> "2.46"). macOS and iOS omit the field entirely.
// Only the OS-specific readers and tests call this on Windows/Linux; other
// targets compile it for the table-driven tests alone.
#[cfg_attr(not(any(target_os = "windows", target_os = "linux")), allow(dead_code))]
pub fn webview_version_query_value(version: &str, parts_to_keep: usize) -> Option<String> {
    let parts: Vec<&str> = version.split('.').collect();
    if parts.len() < parts_to_keep {
        return None;
    }
    let value = parts[..parts_to_keep].join(".");
    valid_webview_version(&value).then_some(value)
}

#[cfg(target_os = "windows")]
pub fn platform_webview_version() -> Option<String> {
    tauri::webview_version()
        .ok()
        .and_then(|version| webview_version_query_value(&version, 1))
}

#[cfg(target_os = "linux")]
pub fn platform_webview_version() -> Option<String> {
    tauri::webview_version()
        .ok()
        .and_then(|version| webview_version_query_value(&version, 2))
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
pub fn platform_webview_version() -> Option<String> {
    None
}

pub fn platform_device_language() -> String {
    normalize_device_language(sys_locale::get_locale().as_deref())
}

#[tauri::command]
pub async fn get_update_device_info() -> Result<UpdateDeviceInfo, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let (device_model, os_version) = platform_device_info();
        UpdateDeviceInfo {
            device_model: metadata_text(device_model),
            os_version: metadata_text(os_version),
        }
    })
    .await
    .map_err(|_| "Could not read update device metadata".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metadata_is_bounded_and_does_not_contain_controls() {
        assert_eq!(metadata_text(None), "unknown");
        assert_eq!(metadata_text(Some(" \n\0 ".to_string())), "unknown");
        assert_eq!(metadata_text(Some(" Model\nName ".to_string())), "unknown");
        assert_eq!(metadata_text(Some("🚀".repeat(129))), "unknown");
        assert_eq!(
            metadata_text(Some("🚀".repeat(128))).encode_utf16().count(),
            MAX_METADATA_CHARS
        );
        assert_eq!(
            metadata_text(Some(" Model Name ".to_string())),
            "Model Name"
        );
    }

    #[test]
    fn platform_metadata_fits_the_wire_contract() {
        let (model, version) = platform_device_info();
        for value in [metadata_text(model), metadata_text(version)] {
            assert!(!value.is_empty());
            assert!(value.encode_utf16().count() <= MAX_METADATA_CHARS);
            assert!(!value.chars().any(char::is_control));
        }
    }

    // The same table as tests/updates/updateUsage.test.js; keep both aligned.
    #[test]
    fn normalizes_device_language_like_the_js_client() {
        let cases: &[(&str, &str)] = &[
            ("ja-JP", "ja"),
            ("en-GB", "en"),
            ("en_US", "en"),
            ("pt-BR", "pt"),
            ("ja-JP-u-ca-japanese", "ja"),
            ("th", "th"),
            ("fil", "fil"),
            ("zh-Hans-CN", "zh-hans"),
            ("zh-Hant-TW", "zh-hant"),
            ("zh-Hant", "zh-hant"),
            ("zh-CN", "zh-hans"),
            ("zh-SG", "zh-hans"),
            ("zh-TW", "zh-hant"),
            ("zh-HK", "zh-hant"),
            ("zh-MO", "zh-hant"),
            ("zh", "zh-hans"),
            ("zh-x-tw", "zh-hans"),
            ("zh-u-nu-hanidec", "zh-hans"),
            ("zh-TW-x-foo", "zh-hant"),
            ("ja-x-tw", "ja"),
            ("zh-u-ca-japanese", "zh-hans"),
            ("zh-419", "zh-hans"),
            ("sr-Latn-RS", "sr"),
            ("en-Latn-US", "en"),
            ("en", "en"),
            ("", "unknown"),
            ("123", "unknown"),
            ("C", "unknown"),
            ("POSIX", "unknown"),
        ];
        for (raw, expected) in cases {
            assert_eq!(&normalize_device_language(Some(raw)), expected, "{raw:?}");
        }
        assert_eq!(normalize_device_language(None), "unknown");
        assert_eq!(normalize_device_language(Some(" ja-JP ")), "ja");
        assert!(valid_ui_language("ja"));
        assert!(valid_ui_language("zh-hans"));
        assert!(!valid_ui_language("unknown"));
        assert!(!valid_ui_language("en-US"));
        assert!(!valid_ui_language("EN"));
    }

    #[test]
    fn webview_versions_use_the_grouping_the_api_expects() {
        assert_eq!(
            webview_version_query_value("128.0.2739.79", 1),
            Some("128".to_string())
        );
        assert_eq!(
            webview_version_query_value("2.46.7", 2),
            Some("2.46".to_string())
        );
        assert_eq!(webview_version_query_value("", 1), None);
        assert_eq!(webview_version_query_value("x.y", 1), None);
        assert_eq!(
            webview_version_query_value("128", 1),
            Some("128".to_string())
        );
        assert_eq!(
            webview_version_query_value("128", 2),
            None,
            "fewer parts than requested is omitted"
        );
        assert!(valid_webview_version("128"));
        assert!(valid_webview_version("2.46"));
        assert!(!valid_webview_version("128.0.6613.84"));
        assert!(!valid_webview_version(""));
        assert!(!valid_webview_version("128."));
        assert!(!valid_webview_version(".128"));
        assert!(!valid_webview_version("01234"));
    }

    #[test]
    fn platform_usage_fields_fit_the_wire_contract() {
        // Runs on the test host OS; both accepted shapes must hold.
        let language = platform_device_language();
        assert!(language == "unknown" || valid_ui_language(&language));
        if let Some(webview) = platform_webview_version() {
            assert!(valid_webview_version(&webview));
        }
    }
}
