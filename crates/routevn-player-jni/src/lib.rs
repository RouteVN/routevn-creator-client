//! JNI bridge used by the exported Android player to read its encrypted game
//! package. The package is an uncompressed asset inside the APK, so Java passes
//! the APK path and the asset's byte range, and Rust decrypts ranges on demand
//! with the same reader the desktop players use.

use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::Path;
use std::sync::Mutex;

use jni::JNIEnv;
use jni::objects::{JByteArray, JClass, JString};
use jni::sys::{jint, jlong};
use routevn_packager::payload::StandaloneChunkedPayloadReader;

const IO_EXCEPTION: &str = "java/io/IOException";

struct PackageHandle {
    reader: Mutex<StandaloneChunkedPayloadReader>,
}

/// Opens the package stored at `[offset, offset + length)` of `path`.
pub fn open_package(path: &Path, offset: u64, length: u64) -> Result<jlong, String> {
    let reader = StandaloneChunkedPayloadReader::open_range(path, offset, length)
        .map_err(|error| format!("Failed to open the game package: {error}"))?;
    let handle = Box::new(PackageHandle {
        reader: Mutex::new(reader),
    });
    Ok(Box::into_raw(handle) as jlong)
}

/// # Safety
/// `handle` must be 0 or a value returned by `open_package` that has not been
/// passed to `close_package`.
pub unsafe fn package_plaintext_length(handle: jlong) -> Result<u64, String> {
    let handle = unsafe { handle_ref(handle) }?;
    let reader = handle
        .reader
        .lock()
        .map_err(|_| "The game package reader is unavailable.".to_string())?;
    Ok(reader.plaintext_len())
}

/// # Safety
/// Same contract as `package_plaintext_length`.
pub unsafe fn read_package(
    handle: jlong,
    position: u64,
    buffer: &mut [u8],
) -> Result<usize, String> {
    let handle = unsafe { handle_ref(handle) }?;
    let mut reader = handle
        .reader
        .lock()
        .map_err(|_| "The game package reader is unavailable.".to_string())?;
    reader
        .read_at(position, buffer)
        .map_err(|error| format!("Failed to read the game package: {error}"))
}

/// # Safety
/// `handle` must be 0 or a live value returned by `open_package`. It must not
/// be used again afterwards.
pub unsafe fn close_package(handle: jlong) {
    if handle != 0 {
        drop(unsafe { Box::from_raw(handle as *mut PackageHandle) });
    }
}

unsafe fn handle_ref<'a>(handle: jlong) -> Result<&'a PackageHandle, String> {
    if handle == 0 {
        return Err("The game package is not open.".to_string());
    }
    Ok(unsafe { &*(handle as *const PackageHandle) })
}

fn throw_io(env: &mut JNIEnv, message: &str) {
    if !env.exception_check().unwrap_or(false) {
        let _ = env.throw_new(IO_EXCEPTION, message);
    }
}

fn guarded<T>(
    env: &mut JNIEnv,
    fallback: T,
    work: impl FnOnce(&mut JNIEnv) -> Result<T, String>,
) -> T {
    match catch_unwind(AssertUnwindSafe(|| work(env))) {
        Ok(Ok(value)) => value,
        Ok(Err(message)) => {
            throw_io(env, &message);
            fallback
        }
        Err(_) => {
            throw_io(env, "The game package reader failed unexpectedly.");
            fallback
        }
    }
}

fn non_negative(value: jlong, name: &str) -> Result<u64, String> {
    u64::try_from(value).map_err(|_| format!("{name} must not be negative."))
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_vn_routevn_androidplayer_NativePackage_open(
    mut env: JNIEnv,
    _class: JClass,
    path: JString,
    offset: jlong,
    length: jlong,
) -> jlong {
    guarded(&mut env, 0, |env| {
        let path: String = env
            .get_string(&path)
            .map_err(|error| format!("Invalid package path: {error}"))?
            .into();
        open_package(
            Path::new(&path),
            non_negative(offset, "offset")?,
            non_negative(length, "length")?,
        )
    })
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_vn_routevn_androidplayer_NativePackage_plaintextLength(
    mut env: JNIEnv,
    _class: JClass,
    handle: jlong,
) -> jlong {
    guarded(&mut env, 0, |_| {
        let length = unsafe { package_plaintext_length(handle) }?;
        jlong::try_from(length).map_err(|_| "The game package is too large.".to_string())
    })
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_vn_routevn_androidplayer_NativePackage_read(
    mut env: JNIEnv,
    _class: JClass,
    handle: jlong,
    position: jlong,
    buffer: JByteArray,
    buffer_offset: jint,
    length: jint,
) -> jint {
    guarded(&mut env, 0, |env| {
        let position = non_negative(position, "position")?;
        let buffer_offset = usize::try_from(buffer_offset)
            .map_err(|_| "bufferOffset must not be negative.".to_string())?;
        let length =
            usize::try_from(length).map_err(|_| "length must not be negative.".to_string())?;
        let array_length = env
            .get_array_length(&buffer)
            .map_err(|error| format!("Invalid buffer: {error}"))?;
        let array_length = usize::try_from(array_length).unwrap_or_default();
        if buffer_offset
            .checked_add(length)
            .is_none_or(|end| end > array_length)
        {
            return Err("The requested range does not fit the buffer.".to_string());
        }

        let mut bytes = vec![0u8; length];
        let copied = unsafe { read_package(handle, position, &mut bytes) }?;
        let signed: Vec<i8> = bytes[..copied].iter().map(|byte| *byte as i8).collect();
        env.set_byte_array_region(&buffer, buffer_offset as i32, &signed)
            .map_err(|error| format!("Failed to copy package bytes: {error}"))?;
        Ok(copied as jint)
    })
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_vn_routevn_androidplayer_NativePackage_close(
    _env: JNIEnv,
    _class: JClass,
    handle: jlong,
) {
    let _ = catch_unwind(|| unsafe { close_package(handle) });
}

#[cfg(test)]
mod tests {
    use super::{close_package, open_package, package_plaintext_length, read_package};
    use routevn_packager::payload::{
        PayloadKey, PayloadNonce, WriteStandaloneChunkedPayloadRequest,
        write_standalone_chunked_encrypted_payload,
    };

    #[test]
    fn opens_reads_and_closes_a_package_range() {
        let temp = tempfile::tempdir().unwrap();
        let plaintext: Vec<u8> = (0..5000u32).map(|value| (value % 251) as u8).collect();
        let payload_path = temp.path().join("payload.bin");
        write_standalone_chunked_encrypted_payload(WriteStandaloneChunkedPayloadRequest {
            output_path: &payload_path,
            payload: &plaintext,
            key: PayloadKey([7; 32]),
            nonce: PayloadNonce([9; 24]),
            chunk_size: 1024,
        })
        .unwrap();
        let payload = std::fs::read(&payload_path).unwrap();
        let apk_path = temp.path().join("game.apk");
        let mut apk = vec![0u8; 4096];
        apk.extend_from_slice(&payload);
        apk.extend_from_slice(&[1, 2, 3]);
        std::fs::write(&apk_path, &apk).unwrap();

        let handle = open_package(&apk_path, 4096, payload.len() as u64).unwrap();
        assert_eq!(unsafe { package_plaintext_length(handle) }.unwrap(), 5000);
        let mut buffer = vec![0u8; 3000];
        assert_eq!(
            unsafe { read_package(handle, 1500, &mut buffer) }.unwrap(),
            3000
        );
        assert_eq!(buffer, plaintext[1500..4500]);
        assert_eq!(
            unsafe { read_package(handle, 5000, &mut buffer) }.unwrap(),
            0
        );
        unsafe { close_package(handle) };

        assert!(unsafe { package_plaintext_length(0) }.is_err());
        assert!(open_package(&apk_path, 0, 10).is_err());
    }
}
