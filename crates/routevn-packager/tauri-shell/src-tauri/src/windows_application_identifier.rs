use std::os::windows::ffi::OsStrExt;
use std::path::Path;

use windows::Win32::Storage::FileSystem::{
    GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW,
};
use windows::core::{PCWSTR, w};

pub fn read(executable_path: &Path) -> Result<String, String> {
    let path = executable_path
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();

    // SAFETY: the path is NUL-terminated. Windows writes only within the
    // allocated version-info buffer; the queried string stays borrowed from
    // that buffer until it has been copied into an owned Rust string.
    unsafe {
        let size = GetFileVersionInfoSizeW(PCWSTR(path.as_ptr()), None);
        if size == 0 {
            return Err("The Windows player is missing its version resources.".to_string());
        }
        // DWORD alignment also guarantees alignment of the UTF-16 query result.
        let mut buffer = vec![0u32; (size as usize).div_ceil(4)];
        GetFileVersionInfoW(
            PCWSTR(path.as_ptr()),
            None,
            size,
            buffer.as_mut_ptr().cast(),
        )
        .map_err(|error| format!("Failed to read Windows player metadata: {error}"))?;

        let mut value = std::ptr::null_mut();
        let mut length = 0;
        // The packager writes its metadata in this English/Unicode string table.
        if !VerQueryValueW(
            buffer.as_ptr().cast(),
            w!("\\StringFileInfo\\040904B0\\InternalName"),
            &mut value,
            &mut length,
        )
        .as_bool()
            || value.is_null()
            || length == 0
        {
            return Err("The Windows player is missing its application identifier.".to_string());
        }

        let units = std::slice::from_raw_parts(value.cast::<u16>(), length as usize);
        let units = units.strip_suffix(&[0]).unwrap_or(units);
        let identifier = String::from_utf16(units)
            .map_err(|_| "The Windows player has an invalid application identifier.".to_string())?;
        if !super::is_valid_application_identifier(&identifier)
            || identifier.eq_ignore_ascii_case("vn.routevn.shell")
        {
            return Err("The Windows player has an invalid application identifier.".to_string());
        }
        Ok(identifier)
    }
}

#[cfg(test)]
mod tests {
    use super::read;
    use routevn_packager::windows_resources::{
        WindowsResourceMetadata, WindowsResourceStampRequest, stamp_windows_resources,
    };
    use std::path::Path;

    fn stamp(output: &Path, identifier: Option<&str>) {
        stamp_windows_resources(WindowsResourceStampRequest {
            template_path: &std::env::current_exe().unwrap(),
            output_path: output,
            metadata: WindowsResourceMetadata {
                title: "Project One",
                version: "1.2.3",
                application_identifier: identifier,
                publisher: None,
                description: None,
                copyright: None,
                original_filename: "Project One.exe",
            },
            icon_png: include_bytes!("../icons/128x128.png"),
        })
        .unwrap();
    }

    #[test]
    fn reads_each_exports_identifier_and_preserves_it_when_renamed() {
        let directory = tempfile::tempdir().unwrap();
        let first = directory.path().join("Project One.exe");
        let second = directory.path().join("Project Two.exe");
        stamp(&first, Some("com.example.project-one"));
        stamp(&second, Some("com.example.project-two"));
        assert_eq!(read(&first).unwrap(), "com.example.project-one");
        assert_eq!(read(&second).unwrap(), "com.example.project-two");
        let renamed = directory.path().join("Renamed.exe");
        std::fs::rename(first, &renamed).unwrap();
        assert_eq!(read(&renamed).unwrap(), "com.example.project-one");
    }

    #[test]
    fn rejects_missing_invalid_and_template_identifiers() {
        let directory = tempfile::tempdir().unwrap();
        for (index, identifier) in [
            None,
            Some("vn.routevn.shell"),
            Some("VN.RouteVN.Shell"),
            Some("../game"),
            Some("com..game"),
        ]
        .into_iter()
        .enumerate()
        {
            let output = directory.path().join(format!("Project {index}.exe"));
            stamp(&output, identifier);
            assert!(read(&output).is_err(), "accepted {identifier:?}");
        }
        assert!(read(&directory.path().join("Missing.exe")).is_err());
    }
}
