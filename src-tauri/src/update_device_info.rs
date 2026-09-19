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
}
