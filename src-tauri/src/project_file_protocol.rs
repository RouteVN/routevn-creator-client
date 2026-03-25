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
    if path.ends_with(".png") {
        return Some("image/png");
    }

    if path.ends_with(".jpg") || path.ends_with(".jpeg") {
        return Some("image/jpeg");
    }

    if path.ends_with(".webp") {
        return Some("image/webp");
    }

    if path.ends_with(".avif") {
        return Some("image/avif");
    }

    if path.ends_with(".mp4") {
        return Some("video/mp4");
    }

    if path.ends_with(".webm") {
        return Some("video/webm");
    }

    if path.ends_with(".ogv") || path.ends_with(".ogg") {
        return Some("video/ogg");
    }

    if path.ends_with(".mov") {
        return Some("video/quicktime");
    }

    None
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
