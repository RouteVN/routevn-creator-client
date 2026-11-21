//! C interface used by the exported iOS player to read its encrypted game
//! package. The package is a file in the app bundle, and Swift asks for
//! decrypted ranges as the web player requests them, with the same reader the
//! desktop and Android players use.

use std::ffi::{CStr, c_char};
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::Path;
use std::sync::Mutex;

use routevn_packager::payload::StandaloneChunkedPayloadReader;

/// An open game package. Opaque to C.
pub struct RouteVNPackage {
    reader: Mutex<StandaloneChunkedPayloadReader>,
    length: u64,
}

/// # Safety
/// `path` must be NULL or a NUL-terminated string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn routevn_package_open(path: *const c_char) -> *mut RouteVNPackage {
    if path.is_null() {
        return std::ptr::null_mut();
    }
    let path = unsafe { CStr::from_ptr(path) };
    catch_unwind(|| {
        let path = path.to_str().ok()?;
        let reader = StandaloneChunkedPayloadReader::open(Path::new(path)).ok()?;
        let length = reader.plaintext_len();
        Some(Box::into_raw(Box::new(RouteVNPackage {
            reader: Mutex::new(reader),
            length,
        })))
    })
    .ok()
    .flatten()
    .unwrap_or(std::ptr::null_mut())
}

/// # Safety
/// `package` must be NULL or a live value returned by `routevn_package_open`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn routevn_package_length(package: *const RouteVNPackage) -> u64 {
    unsafe { package.as_ref() }.map_or(0, |package| package.length)
}

/// # Safety
/// `package` must be NULL or a live value returned by `routevn_package_open`,
/// and `buffer` must be valid for writes of `length` bytes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn routevn_package_read(
    package: *const RouteVNPackage,
    position: u64,
    buffer: *mut u8,
    length: usize,
) -> i64 {
    let Some(package) = (unsafe { package.as_ref() }) else {
        return -1;
    };
    if length == 0 {
        return 0;
    }
    if buffer.is_null() {
        return -1;
    }
    let buffer = unsafe { std::slice::from_raw_parts_mut(buffer, length) };
    catch_unwind(AssertUnwindSafe(|| {
        let mut reader = package.reader.lock().ok()?;
        let copied = reader.read_at(position, buffer).ok()?;
        i64::try_from(copied).ok()
    }))
    .ok()
    .flatten()
    .unwrap_or(-1)
}

/// # Safety
/// `package` must be NULL or a live value returned by `routevn_package_open`.
/// It must not be used again afterwards.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn routevn_package_close(package: *mut RouteVNPackage) {
    if !package.is_null() {
        let _ = catch_unwind(AssertUnwindSafe(|| {
            drop(unsafe { Box::from_raw(package) });
        }));
    }
}

#[cfg(test)]
mod tests {
    use super::{
        routevn_package_close, routevn_package_length, routevn_package_open, routevn_package_read,
    };
    use routevn_packager::payload::{
        PayloadKey, PayloadNonce, WriteStandaloneChunkedPayloadRequest,
        write_standalone_chunked_encrypted_payload,
    };
    use std::ffi::CString;

    #[test]
    fn opens_reads_and_closes_a_package() {
        let temp = tempfile::tempdir().unwrap();
        let plaintext: Vec<u8> = (0..5000u32).map(|value| (value % 251) as u8).collect();
        let path = temp.path().join("routevn-package.bin");
        write_standalone_chunked_encrypted_payload(WriteStandaloneChunkedPayloadRequest {
            output_path: &path,
            payload: &plaintext,
            key: PayloadKey([7; 32]),
            nonce: PayloadNonce([9; 24]),
            chunk_size: 1024,
        })
        .unwrap();
        let path = CString::new(path.to_str().unwrap()).unwrap();

        unsafe {
            let package = routevn_package_open(path.as_ptr());
            assert!(!package.is_null());
            assert_eq!(routevn_package_length(package), 5000);
            let mut buffer = vec![0u8; 3000];
            assert_eq!(
                routevn_package_read(package, 1500, buffer.as_mut_ptr(), buffer.len()),
                3000
            );
            assert_eq!(buffer, plaintext[1500..4500]);
            assert_eq!(
                routevn_package_read(package, 5000, buffer.as_mut_ptr(), buffer.len()),
                0
            );
            assert_eq!(
                routevn_package_read(package, 0, std::ptr::null_mut(), 10),
                -1
            );
            routevn_package_close(package);
        }
    }

    #[test]
    fn rejects_missing_and_invalid_packages() {
        let temp = tempfile::tempdir().unwrap();
        let invalid = temp.path().join("invalid.bin");
        std::fs::write(&invalid, b"not a package").unwrap();
        unsafe {
            assert!(routevn_package_open(std::ptr::null()).is_null());
            let missing = CString::new(temp.path().join("missing.bin").to_str().unwrap()).unwrap();
            assert!(routevn_package_open(missing.as_ptr()).is_null());
            let invalid = CString::new(invalid.to_str().unwrap()).unwrap();
            assert!(routevn_package_open(invalid.as_ptr()).is_null());
            assert_eq!(routevn_package_length(std::ptr::null()), 0);
            assert_eq!(
                routevn_package_read(std::ptr::null(), 0, std::ptr::null_mut(), 0),
                -1
            );
            routevn_package_close(std::ptr::null_mut());
        }
    }
}
