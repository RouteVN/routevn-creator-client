//! Free-space check that runs before an export writes anything.
//!
//! An export of a large game writes several gigabytes. Without this check, a
//! nearly full device fails with a write error late in the export. The check
//! estimates the peak use of each volume the export writes to and stops with
//! [`ErrorCode::NotEnoughSpace`] when a volume has less free space.

use std::path::Path;

use crate::error::{ErrorCode, ExportError, Result};

/// Left free on each volume on top of the estimate. It covers the package
/// index, the encryption overhead (about 32 bytes per MiB), icons that grow
/// when they are rendered, and other writes during the export.
pub const SPACE_MARGIN_BYTES: u64 = 64 * 1024 * 1024;

/// One volume the export writes to and the free bytes it needs at its peak.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SpaceNeed<'a> {
    pub path: &'a Path,
    pub bytes: u64,
}

/// The free space the export needs, given the estimated size of the game
/// package and of the finished APK.
///
/// - packaging writes the plain game package and then its encrypted copy into
///   the work folder; both exist until encryption finishes
/// - writing the APK keeps the encrypted package in the work folder while the
///   APK grows in the output folder; the plain package is already removed
/// - when `copy_after_export` is set, the host then copies the APK to the
///   creator's chosen location while the APK still exists in the output
///   folder; the copy is assumed to land on the output folder's volume
///
/// When the work and output folders share a volume, the phases add up on it.
pub fn space_needs<'a>(
    work_dir: &'a Path,
    output_dir: &'a Path,
    same_volume: bool,
    package_bytes: u64,
    apk_bytes: u64,
    copy_after_export: bool,
) -> Vec<SpaceNeed<'a>> {
    let packaging = package_bytes.saturating_mul(2);
    let host_copy = if copy_after_export {
        apk_bytes.saturating_mul(2)
    } else {
        0
    };
    if same_volume {
        let peak = packaging
            .max(package_bytes.saturating_add(apk_bytes))
            .max(host_copy);
        return vec![SpaceNeed {
            path: work_dir,
            bytes: peak.saturating_add(SPACE_MARGIN_BYTES),
        }];
    }
    vec![
        SpaceNeed {
            path: work_dir,
            bytes: packaging.saturating_add(SPACE_MARGIN_BYTES),
        },
        SpaceNeed {
            path: output_dir,
            bytes: apk_bytes.max(host_copy).saturating_add(SPACE_MARGIN_BYTES),
        },
    ]
}

/// Fails when a volume has less free space than it needs. A volume whose
/// free space cannot be measured is not checked; the export then proceeds and
/// a full volume still fails with a write error.
pub fn check_space(
    needs: &[SpaceNeed<'_>],
    available: impl Fn(&Path) -> Option<u64>,
) -> Result<()> {
    for need in needs {
        let Some(free) = available(need.path) else {
            continue;
        };
        if free < need.bytes {
            return Err(ExportError::new(
                ErrorCode::NotEnoughSpace,
                format!(
                    "Not enough free space to export: about {} is needed on the volume of {} and {} is free.",
                    format_bytes(need.bytes),
                    need.path.display(),
                    format_bytes(free)
                ),
            ));
        }
    }
    Ok(())
}

fn format_bytes(bytes: u64) -> String {
    const MB: f64 = 1_000_000.0;
    const GB: f64 = 1_000_000_000.0;
    let value = bytes as f64;
    if value >= GB {
        format!("{:.1} GB", value / GB)
    } else {
        format!("{:.0} MB", (value / MB).ceil())
    }
}

/// Free bytes this app can write on the volume that holds `path`, or `None`
/// when the platform cannot tell. On macOS and iOS this includes space the
/// system frees on demand, such as purgeable caches, as Apple recommends for
/// work the user asked for.
pub fn available_space(path: &Path) -> Option<u64> {
    platform::available_space(path)
}

/// Whether two existing paths are on the same volume. When that cannot be
/// determined, they are treated as one volume, which is the stricter check.
pub fn same_volume(a: &Path, b: &Path) -> bool {
    platform::same_volume(a, b).unwrap_or(true)
}

#[cfg(unix)]
mod platform {
    use std::os::unix::fs::MetadataExt;
    use std::path::Path;

    pub fn available_space(path: &Path) -> Option<u64> {
        let stats = rustix::fs::statvfs(path).ok()?;
        let free = stats.f_bavail.checked_mul(stats.f_frsize)?;
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let Some(capacity) = super::apple::important_usage_capacity(path) {
            return Some(capacity.max(free));
        }
        Some(free)
    }

    pub fn same_volume(a: &Path, b: &Path) -> Option<bool> {
        Some(std::fs::metadata(a).ok()?.dev() == std::fs::metadata(b).ok()?.dev())
    }
}

#[cfg(windows)]
mod platform {
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;

    use windows_sys::Win32::Storage::FileSystem::{GetDiskFreeSpaceExW, GetVolumePathNameW};

    fn wide(path: &Path) -> Vec<u16> {
        path.as_os_str().encode_wide().chain(Some(0)).collect()
    }

    pub fn available_space(path: &Path) -> Option<u64> {
        let path = wide(path);
        let mut free = 0u64;
        // SAFETY: `path` is NUL-terminated, and the out pointer is valid for
        // the call; the unused out pointers may be null.
        let ok = unsafe {
            GetDiskFreeSpaceExW(
                path.as_ptr(),
                &mut free,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        };
        (ok != 0).then_some(free)
    }

    fn volume_root(path: &Path) -> Option<String> {
        let path = wide(path);
        let mut root = vec![0u16; 1024];
        // SAFETY: `path` is NUL-terminated and `root` holds `root.len()` units.
        let ok = unsafe { GetVolumePathNameW(path.as_ptr(), root.as_mut_ptr(), root.len() as u32) };
        if ok == 0 {
            return None;
        }
        let length = root.iter().position(|unit| *unit == 0)?;
        Some(String::from_utf16_lossy(&root[..length]).to_lowercase())
    }

    pub fn same_volume(a: &Path, b: &Path) -> Option<bool> {
        Some(volume_root(a)? == volume_root(b)?)
    }
}

#[cfg(not(any(unix, windows)))]
mod platform {
    use std::path::Path;

    pub fn available_space(_path: &Path) -> Option<u64> {
        None
    }

    pub fn same_volume(_a: &Path, _b: &Path) -> Option<bool> {
        None
    }
}

#[cfg(any(target_os = "macos", target_os = "ios"))]
mod apple {
    use std::ffi::c_void;
    use std::os::unix::ffi::OsStrExt;
    use std::path::Path;

    type CFTypeRef = *const c_void;
    type CFIndex = isize;
    type CFTypeID = usize;
    type Boolean = u8;

    const K_CF_NUMBER_SINT64_TYPE: CFIndex = 4;

    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        static kCFURLVolumeAvailableCapacityForImportantUsageKey: CFTypeRef;
        fn CFURLCreateFromFileSystemRepresentation(
            allocator: CFTypeRef,
            buffer: *const u8,
            length: CFIndex,
            is_directory: Boolean,
        ) -> CFTypeRef;
        fn CFURLCopyResourcePropertyForKey(
            url: CFTypeRef,
            key: CFTypeRef,
            value: *mut CFTypeRef,
            error: *mut CFTypeRef,
        ) -> Boolean;
        fn CFGetTypeID(value: CFTypeRef) -> CFTypeID;
        fn CFNumberGetTypeID() -> CFTypeID;
        fn CFNumberGetValue(number: CFTypeRef, number_type: CFIndex, value: *mut c_void)
        -> Boolean;
        fn CFRelease(value: CFTypeRef);
    }

    /// The volume's available capacity for important usage: free space plus
    /// what the system can purge for work the user asked for.
    pub fn important_usage_capacity(path: &Path) -> Option<u64> {
        let bytes = path.as_os_str().as_bytes();
        let length = CFIndex::try_from(bytes.len()).ok()?;
        // SAFETY: the buffer and length describe `bytes`; every object this
        // function creates or copies is released once, and the value is read
        // as a CFNumber only after its type is checked.
        unsafe {
            let url = CFURLCreateFromFileSystemRepresentation(
                std::ptr::null(),
                bytes.as_ptr(),
                length,
                1,
            );
            if url.is_null() {
                return None;
            }
            let mut value: CFTypeRef = std::ptr::null();
            let found = CFURLCopyResourcePropertyForKey(
                url,
                kCFURLVolumeAvailableCapacityForImportantUsageKey,
                &mut value,
                std::ptr::null_mut(),
            );
            CFRelease(url);
            if found == 0 || value.is_null() {
                return None;
            }
            let mut capacity = 0i64;
            let read = CFGetTypeID(value) == CFNumberGetTypeID()
                && CFNumberGetValue(
                    value,
                    K_CF_NUMBER_SINT64_TYPE,
                    (&mut capacity as *mut i64).cast(),
                ) != 0;
            CFRelease(value);
            if read {
                u64::try_from(capacity).ok()
            } else {
                None
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    const MB: u64 = 1_000_000;

    #[test]
    fn same_volume_needs_the_largest_phase_plus_margin() {
        let work = PathBuf::from("work");
        let output = PathBuf::from("output");
        let needs = space_needs(&work, &output, true, 100 * MB, 103 * MB, false);
        assert_eq!(
            needs,
            vec![SpaceNeed {
                path: &work,
                bytes: 203 * MB + SPACE_MARGIN_BYTES,
            }]
        );
    }

    #[test]
    fn same_volume_with_a_host_copy_needs_two_apks() {
        let work = PathBuf::from("work");
        let output = PathBuf::from("output");
        let needs = space_needs(&work, &output, true, 100 * MB, 103 * MB, true);
        assert_eq!(needs[0].bytes, 206 * MB + SPACE_MARGIN_BYTES);
    }

    #[test]
    fn separate_volumes_are_checked_separately() {
        let work = PathBuf::from("work");
        let output = PathBuf::from("output");
        let needs = space_needs(&work, &output, false, 100 * MB, 103 * MB, false);
        assert_eq!(
            needs,
            vec![
                SpaceNeed {
                    path: &work,
                    bytes: 200 * MB + SPACE_MARGIN_BYTES,
                },
                SpaceNeed {
                    path: &output,
                    bytes: 103 * MB + SPACE_MARGIN_BYTES,
                },
            ]
        );
        let with_copy = space_needs(&work, &output, false, 100 * MB, 103 * MB, true);
        assert_eq!(with_copy[1].bytes, 206 * MB + SPACE_MARGIN_BYTES);
    }

    #[test]
    fn huge_sizes_saturate_instead_of_overflowing() {
        let work = PathBuf::from("work");
        let needs = space_needs(&work, &work, true, u64::MAX, u64::MAX, true);
        assert_eq!(needs[0].bytes, u64::MAX);
    }

    #[test]
    fn check_reports_the_needed_and_free_space() {
        let work = PathBuf::from("work");
        let needs = [SpaceNeed {
            path: &work,
            bytes: 2_300_000_000,
        }];
        let error = check_space(&needs, |_| Some(512 * MB)).unwrap_err();
        assert_eq!(error.code, ErrorCode::NotEnoughSpace);
        assert_eq!(
            error.message,
            "Not enough free space to export: about 2.3 GB is needed on the volume of work and 512 MB is free."
        );
    }

    #[test]
    fn check_passes_with_enough_space_or_no_measurement() {
        let work = PathBuf::from("work");
        let needs = [SpaceNeed {
            path: &work,
            bytes: 100 * MB,
        }];
        assert!(check_space(&needs, |_| Some(100 * MB)).is_ok());
        assert!(check_space(&needs, |_| None).is_ok());
    }

    #[test]
    fn measures_the_temp_volume() {
        let temp = std::env::temp_dir();
        let free = available_space(&temp).expect("free space of the temp folder");
        assert!(free > 0);
        assert!(same_volume(&temp, &temp));
    }
}
