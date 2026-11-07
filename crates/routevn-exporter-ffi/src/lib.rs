//! C interface to the RouteVN exporters, linked into the iOS Creator app as a
//! static library. Every function returns an owned JSON string that the caller
//! frees with `routevn_string_free`.

use std::ffi::{CStr, CString, c_char, c_void};
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::Path;

use routevn_android_export::{AndroidExportRequest, ErrorCode, ExportError};
use routevn_exporter::ZipExportProgress;
use serde::Serialize;

pub type ProgressCallback = Option<
    unsafe extern "C" fn(context: *mut c_void, phase: *const c_char, current: u64, total: u64),
>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Response<T: Serialize> {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ExportError>,
}

fn into_c_string(json: String) -> *mut c_char {
    CString::new(json)
        .unwrap_or_else(|_| CString::new(r#"{"ok":false}"#).expect("static JSON has no NUL"))
        .into_raw()
}

fn to_json<T: Serialize>(value: &T) -> String {
    serde_json::to_string(value).unwrap_or_else(|error| {
        format!(
            r#"{{"ok":false,"error":{{"code":"write-failed","message":"Failed to encode the export result: {}"}}}}"#,
            error.to_string().replace('"', "'")
        )
    })
}

/// # Safety
/// `value` must be NULL or a NUL-terminated string.
unsafe fn read_str<'a>(value: *const c_char, name: &str) -> Result<&'a str, ExportError> {
    if value.is_null() {
        return Err(ExportError::invalid_request(format!("{name} is required.")));
    }
    unsafe { CStr::from_ptr(value) }
        .to_str()
        .map_err(|_| ExportError::invalid_request(format!("{name} is not valid UTF-8.")))
}

/// # Safety
/// Both arguments must be NULL or NUL-terminated strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn routevn_android_export_capabilities(
    template_path: *const c_char,
    descriptor_path: *const c_char,
) -> *mut c_char {
    let result = catch_unwind(AssertUnwindSafe(|| {
        let template = unsafe { read_str(template_path, "templatePath") }?;
        let descriptor = unsafe { read_str(descriptor_path, "descriptorPath") }?;
        Ok::<_, ExportError>(routevn_android_export::host_capabilities(
            Path::new(template),
            Path::new(descriptor),
        ))
    }));
    let json = match result {
        Ok(Ok(capabilities)) => to_json(&capabilities),
        Ok(Err(error)) => {
            to_json(&serde_json::json!({ "available": false, "reason": error.message }))
        }
        Err(_) => r#"{"available":false,"reason":"The Android exporter failed unexpectedly."}"#
            .to_string(),
    };
    into_c_string(json)
}

struct ProgressSink {
    callback: unsafe extern "C" fn(*mut c_void, *const c_char, u64, u64),
    context: *mut c_void,
}

// The C contract requires `context` to be usable from any thread.
unsafe impl Send for ProgressSink {}
unsafe impl Sync for ProgressSink {}

impl ProgressSink {
    fn emit(&self, progress: ZipExportProgress) {
        if let Ok(phase) = CString::new(progress.phase) {
            unsafe {
                (self.callback)(
                    self.context,
                    phase.as_ptr(),
                    progress.current,
                    progress.total,
                )
            };
        }
    }
}

fn run_export(request_json: &str, sink: Option<&ProgressSink>) -> Result<String, ExportError> {
    let request: AndroidExportRequest = serde_json::from_str(request_json).map_err(|error| {
        ExportError::invalid_request(format!("Invalid export request: {error}"))
    })?;
    let callback = |progress: ZipExportProgress| {
        if let Some(sink) = sink {
            sink.emit(progress);
        }
    };
    let result = routevn_android_export::export_android_apk(&request, Some(&callback))?;
    Ok(to_json(&Response {
        ok: true,
        result: Some(result),
        error: None,
    }))
}

/// # Safety
/// `request_json` must be NULL or a NUL-terminated string. `on_progress`, when
/// set, must be safe to call from any thread with `context`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn routevn_android_export_apk(
    request_json: *const c_char,
    on_progress: ProgressCallback,
    context: *mut c_void,
) -> *mut c_char {
    let sink = on_progress.map(|callback| ProgressSink { callback, context });
    let result = catch_unwind(AssertUnwindSafe(|| {
        let request = unsafe { read_str(request_json, "request") }?;
        run_export(request, sink.as_ref())
    }));
    let json = match result {
        Ok(Ok(json)) => json,
        Ok(Err(error)) => to_json(&Response::<()> {
            ok: false,
            result: None,
            error: Some(error),
        }),
        Err(_) => to_json(&Response::<()> {
            ok: false,
            result: None,
            error: Some(ExportError::new(
                ErrorCode::WriteFailed,
                "The Android exporter failed unexpectedly.",
            )),
        }),
    };
    into_c_string(json)
}

/// # Safety
/// `value` must be NULL or a string returned by this library that was not
/// freed yet.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn routevn_string_free(value: *mut c_char) {
    if !value.is_null() {
        drop(unsafe { CString::from_raw(value) });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    unsafe fn take(value: *mut c_char) -> serde_json::Value {
        let text = unsafe { CStr::from_ptr(value) }
            .to_str()
            .unwrap()
            .to_string();
        unsafe { routevn_string_free(value) };
        serde_json::from_str(&text).unwrap()
    }

    #[test]
    fn reports_missing_templates_as_unavailable() {
        let template = CString::new("/missing/template.apk").unwrap();
        let descriptor = CString::new("/missing/template.json").unwrap();
        let value = unsafe {
            take(routevn_android_export_capabilities(
                template.as_ptr(),
                descriptor.as_ptr(),
            ))
        };
        assert_eq!(value["available"], false);
        assert!(value["reason"].as_str().unwrap().contains("not installed"));

        let value = unsafe {
            take(routevn_android_export_capabilities(
                std::ptr::null(),
                descriptor.as_ptr(),
            ))
        };
        assert_eq!(value["available"], false);
    }

    #[test]
    fn returns_coded_errors_for_bad_requests() {
        let value = unsafe {
            take(routevn_android_export_apk(
                std::ptr::null(),
                None,
                std::ptr::null_mut(),
            ))
        };
        assert_eq!(value["ok"], false);
        assert_eq!(value["error"]["code"], "invalid-request");

        let request = CString::new("{not json").unwrap();
        let value = unsafe {
            take(routevn_android_export_apk(
                request.as_ptr(),
                None,
                std::ptr::null_mut(),
            ))
        };
        assert_eq!(value["error"]["code"], "invalid-request");

        let work = tempfile::tempdir().unwrap();
        let request = serde_json::json!({
            "templatePath": work.path().join("t.apk"),
            "descriptorPath": work.path().join("t.json"),
            "outputPath": work.path().join("out.apk"),
            "assets": [],
            "instructionsJson": "{}",
            "applicationId": "com.example-game",
            "applicationName": "Game One",
            "versionName": "1.0.0",
            "versionCode": 1,
            "orientation": "landscape",
            "iconPath": work.path().join("icon.png"),
            "iconBackgroundColor": "#FFFFFF",
            "splashBackgroundColor": "#000000"
        });
        let request = CString::new(request.to_string()).unwrap();
        let value = unsafe {
            take(routevn_android_export_apk(
                request.as_ptr(),
                None,
                std::ptr::null_mut(),
            ))
        };
        assert_eq!(value["error"]["code"], "invalid-request");
        assert!(
            value["error"]["message"]
                .as_str()
                .unwrap()
                .contains("com.example-game")
        );
    }
}
