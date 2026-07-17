use jni::JNIEnv;
use jni::objects::{JClass, JString};
use jni::sys::jstring;
use routevn_exporter::{ZipAssetInput, ZipExportStats};
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
