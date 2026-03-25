use tauri::{
    http::{
        header::{
            ACCESS_CONTROL_ALLOW_METHODS, ACCESS_CONTROL_ALLOW_ORIGIN, CACHE_CONTROL, CONTENT_TYPE,
        },
        Request, Response, StatusCode,
    },
    Runtime, UriSchemeContext, Url,
};

const PROJECT_FILE_REQUEST_BASE: &str = "http://project-file.localhost";
const MEDIA_MIME_BY_EXTENSION: &[(&str, &str)] = &[
    (".apng", "image/apng"),
    (".png", "image/png"),
    (".jpg", "image/jpeg"),
    (".jpeg", "image/jpeg"),
    (".jpe", "image/jpeg"),
    (".webp", "image/webp"),
    (".avif", "image/avif"),
    (".gif", "image/gif"),
    (".bmp", "image/bmp"),
    (".ico", "image/x-icon"),
    (".cur", "image/x-icon"),
    (".svg", "image/svg+xml"),
    (".tif", "image/tiff"),
    (".tiff", "image/tiff"),
    (".heic", "image/heic"),
    (".heif", "image/heif"),
    (".jxl", "image/jxl"),
    (".mp4", "video/mp4"),
    (".m4v", "video/x-m4v"),
    (".webm", "video/webm"),
    (".ogv", "video/ogg"),
    (".ogg", "video/ogg"),
    (".mov", "video/quicktime"),
    (".qt", "video/quicktime"),
    (".avi", "video/x-msvideo"),
    (".wmv", "video/x-ms-wmv"),
    (".mpg", "video/mpeg"),
    (".mpeg", "video/mpeg"),
    (".m2v", "video/mpeg"),
    (".ts", "video/mp2t"),
    (".mts", "video/mp2t"),
    (".m2ts", "video/mp2t"),
    (".3gp", "video/3gpp"),
    (".3g2", "video/3gpp2"),
    (".mkv", "video/x-matroska"),
];

fn build_error_response(status: StatusCode, message: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(ACCESS_CONTROL_ALLOW_METHODS, "GET, OPTIONS")
        .header(CACHE_CONTROL, "no-store")
        .header(CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(message.as_bytes().to_vec())
        .unwrap()
}

fn get_media_mime_from_request_path(path: &str) -> Option<&'static str> {
    let normalized_path = path.to_ascii_lowercase();

    MEDIA_MIME_BY_EXTENSION
        .iter()
        .find_map(|(extension, mime)| normalized_path.ends_with(extension).then_some(*mime))
}

fn is_allowed_project_file_path(path: &str) -> bool {
    path.contains("\\files\\") || path.contains("/files/")
}

pub fn handle<R: Runtime>(
    _ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    if request.method() == "OPTIONS" {
        return Response::builder()
            .status(StatusCode::NO_CONTENT)
            .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .header(ACCESS_CONTROL_ALLOW_METHODS, "GET, OPTIONS")
            .header(CACHE_CONTROL, "no-store")
            .body(Vec::new())
            .unwrap();
    }

    let request_url = match Url::parse(&format!("{PROJECT_FILE_REQUEST_BASE}{}", request.uri())) {
        Ok(url) => url,
        Err(_) => {
            return build_error_response(
                StatusCode::BAD_REQUEST,
                "Invalid project-file request URL",
            )
        }
    };

    let file_path = request_url
        .query_pairs()
        .find(|(key, _)| key == "path")
        .map(|(_, value)| value.into_owned());

    let Some(file_path) = file_path else {
        return build_error_response(StatusCode::BAD_REQUEST, "Missing file path");
    };

    if !is_allowed_project_file_path(&file_path) {
        return build_error_response(StatusCode::BAD_REQUEST, "Unsupported file path");
    }

    let Some(content_type) = get_media_mime_from_request_path(request_url.path()) else {
        return build_error_response(StatusCode::BAD_REQUEST, "Unsupported media extension");
    };

    let bytes = match std::fs::read(&file_path) {
        Ok(bytes) => bytes,
        Err(_) => {
            return build_error_response(StatusCode::NOT_FOUND, "File not found");
        }
    };

    Response::builder()
        .status(StatusCode::OK)
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(ACCESS_CONTROL_ALLOW_METHODS, "GET, OPTIONS")
        .header(CACHE_CONTROL, "no-store")
        .header(CONTENT_TYPE, content_type)
        .body(bytes)
        .unwrap()
}
