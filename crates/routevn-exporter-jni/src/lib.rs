use jni::objects::{JClass, JObject, JString, JValue};
use jni::sys::{jint, jstring};
use jni::{JNIEnv, JavaVM};
use routevn_android_export::{AndroidExportRequest, AndroidExportResult, ErrorCode, ExportError};
use routevn_exporter::{ZipAssetInput, ZipExportProgress, ZipExportStats};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeExportRequest {
    output_path: String,
    assets: Vec<ZipAssetInput>,
    instructions_json: String,
    index_html: Option<String>,
    main_js: Option<String>,
    manifest_json: Option<String>,
    web_icon_file_id: Option<String>,
    use_part_file: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeExportResponse {
    ok: bool,
    stats: Option<ZipExportStats>,
    error: Option<String>,
}

fn java_string_to_string(env: &mut JNIEnv, value: &JString) -> Result<String, String> {
    env.get_string(value)
        .map(|text| text.into())
        .map_err(|error| format!("Failed to read Java string: {error}"))
}

fn response_json(response: NativeExportResponse) -> String {
    serde_json::to_string(&response).unwrap_or_else(|_| {
        r#"{"ok":false,"stats":null,"error":"Failed to serialize native export response."}"#
            .to_string()
    })
}

fn export_response(result: Result<ZipExportStats, String>) -> String {
    match result {
        Ok(stats) => response_json(NativeExportResponse {
            ok: true,
            stats: Some(stats),
            error: None,
        }),
        Err(error) => response_json(NativeExportResponse {
            ok: false,
            stats: None,
            error: Some(error),
        }),
    }
}

fn run_native_export(payload_json: String) -> Result<ZipExportStats, String> {
    let request = serde_json::from_str::<NativeExportRequest>(&payload_json)
        .map_err(|error| format!("Invalid native export request: {error}"))?;

    routevn_exporter::create_distribution_zip_streamed_sync(
        request.output_path,
        request.assets,
        request.instructions_json,
        request.index_html,
        request.main_js,
        request.manifest_json,
        request.web_icon_file_id,
        request.use_part_file.unwrap_or(true),
    )
}

fn new_java_string(env: &mut JNIEnv, value: String) -> jstring {
    match env.new_string(value) {
        Ok(value) => value.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_routevn_creator_NativeExporter_nativeSelfTest(
    mut env: JNIEnv,
    _class: JClass,
) -> jstring {
    let message = format!(
        r#"{{"ok":true,"message":"routevn-exporter-jni","bundleVersion":{}}}"#,
        routevn_exporter::bundle_format_version()
    );

    new_java_string(&mut env, message)
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_routevn_creator_NativeExporter_nativeCreateDistributionZipStreamed(
    mut env: JNIEnv,
    _class: JClass,
    payload_json: JString,
) -> jstring {
    let response = match java_string_to_string(&mut env, &payload_json) {
        Ok(payload) => {
            let result = std::panic::catch_unwind(|| run_native_export(payload))
                .map_err(|_| "Native distribution ZIP export panicked.".to_string())
                .and_then(|result| result);
            export_response(result)
        }
        Err(error) => response_json(NativeExportResponse {
            ok: false,
            stats: None,
            error: Some(error),
        }),
    };

    new_java_string(&mut env, response)
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_routevn_creator_NativeExporter_nativeAndroidExportCapabilities(
    mut env: JNIEnv,
    _class: JClass,
    template_path: JString,
    descriptor_path: JString,
) -> jstring {
    let paths = java_string_to_string(&mut env, &template_path).and_then(|template| {
        java_string_to_string(&mut env, &descriptor_path).map(|descriptor| (template, descriptor))
    });
    let json = match paths {
        Ok((template, descriptor)) => std::panic::catch_unwind(|| {
            routevn_android_export::host_capabilities(
                std::path::Path::new(&template),
                std::path::Path::new(&descriptor),
            )
        })
        .map(|capabilities| serde_json::to_string(&capabilities).unwrap_or_default())
        .unwrap_or_default(),
        Err(_) => String::new(),
    };
    let json = if json.is_empty() {
        r#"{"available":false,"reason":"The Android exporter is unavailable."}"#.to_string()
    } else {
        json
    };
    new_java_string(&mut env, json)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AndroidApkExportResponse {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<AndroidExportResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<ExportError>,
}

fn android_apk_response(result: Result<AndroidExportResult, ExportError>) -> String {
    let response = match result {
        Ok(result) => AndroidApkExportResponse {
            ok: true,
            result: Some(result),
            error: None,
        },
        Err(error) => AndroidApkExportResponse {
            ok: false,
            result: None,
            error: Some(error),
        },
    };
    serde_json::to_string(&response).unwrap_or_else(|_| {
        r#"{"ok":false,"error":{"code":"write-failed","message":"Failed to serialize the APK export result."}}"#
            .to_string()
    })
}

/// Forwards exporter progress to a Java `NativeExporter.ProgressListener`.
/// The exporter may report from worker threads, so every call attaches the
/// current thread to the VM.
struct JavaProgressListener {
    vm: JavaVM,
    listener: jni::objects::GlobalRef,
}

impl JavaProgressListener {
    fn emit(&self, progress: ZipExportProgress) {
        let Ok(mut env) = self.vm.attach_current_thread() else {
            return;
        };
        let Ok(phase) = env.new_string(&progress.phase) else {
            let _ = env.exception_clear();
            return;
        };
        let current = i64::try_from(progress.current).unwrap_or(i64::MAX);
        let total = i64::try_from(progress.total).unwrap_or(i64::MAX);
        let called = env.call_method(
            self.listener.as_obj(),
            "onProgress",
            "(Ljava/lang/String;JJ)V",
            &[
                JValue::Object(&phase),
                JValue::Long(current),
                JValue::Long(total),
            ],
        );
        if called.is_err() || env.exception_check().unwrap_or(false) {
            // Progress is best effort and must not fail the export.
            let _ = env.exception_clear();
        }
        let _ = env.delete_local_ref(phase);
    }
}

fn run_android_apk_export(
    payload_json: &str,
    listener: Option<&JavaProgressListener>,
) -> Result<AndroidExportResult, ExportError> {
    let request: AndroidExportRequest = serde_json::from_str(payload_json).map_err(|error| {
        ExportError::invalid_request(format!("Invalid Android export request: {error}"))
    })?;
    let on_progress = |progress: ZipExportProgress| {
        if let Some(listener) = listener {
            listener.emit(progress);
        }
    };
    routevn_android_export::export_android_apk(&request, Some(&on_progress))
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_com_routevn_creator_NativeExporter_nativeExportAndroidApk(
    mut env: JNIEnv,
    _class: JClass,
    payload_json: JString,
    listener: JObject,
) -> jstring {
    let payload = match java_string_to_string(&mut env, &payload_json) {
        Ok(payload) => payload,
        Err(error) => {
            let json = android_apk_response(Err(ExportError::invalid_request(error)));
            return new_java_string(&mut env, json);
        }
    };
    let progress = if listener.is_null() {
        None
    } else {
        match (env.get_java_vm(), env.new_global_ref(&listener)) {
            (Ok(vm), Ok(listener)) => Some(JavaProgressListener { vm, listener }),
            _ => {
                let _ = env.exception_clear();
                None
            }
        }
    };
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        run_android_apk_export(&payload, progress.as_ref())
    }))
    .unwrap_or_else(|_| {
        Err(ExportError::new(
            ErrorCode::WriteFailed,
            "The Android exporter failed unexpectedly.",
        ))
    });
    drop(progress);
    let json = android_apk_response(result);
    new_java_string(&mut env, json)
}

/// Crashes the app on purpose so native crash reporting, and this library's
/// symbols, can be checked on a release build. Only a project created with a
/// test crash name reaches it (see src/internal/testCrashes.js).
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_routevn_creator_NativeExporter_nativeTestCrash(
    _env: JNIEnv,
    _class: JClass,
    kind: jint,
) {
    if kind == 0 {
        // A panic cannot unwind out of an `extern "system"` function, so the
        // process aborts inside this library.
        panic!("RouteVN test panic");
    }
    // A write to an unmapped address raises SIGSEGV in this library. The fault is
    // the point: `write_volatile` keeps the store, and address 8 is never mapped.
    unsafe { std::ptr::without_provenance_mut::<u8>(8).write_volatile(1) };
}
