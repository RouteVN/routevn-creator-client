use std::io::{Read, Seek, SeekFrom};

use tauri::{
    Url,
    http::{
        Request, Response, StatusCode,
        header::{
            ACCEPT_RANGES, ACCESS_CONTROL_ALLOW_HEADERS, ACCESS_CONTROL_ALLOW_METHODS,
            ACCESS_CONTROL_ALLOW_ORIGIN, ACCESS_CONTROL_EXPOSE_HEADERS, CACHE_CONTROL,
            CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE, RANGE,
        },
    },
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

const MAX_RANGE_LEN: u64 = 1000 * 1024;

// None means the header is malformed and should be ignored.
fn parse_range(value: &str, size: u64) -> Option<Result<(u64, u64), ()>> {
    let range = value.strip_prefix("bytes=")?;
    let (start, end) = range.split_once('-')?;
    let number = |value: &str| {
        if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
            None
        } else {
            value.parse::<u64>().ok()
        }
    };
    let (start, end) = if start.is_empty() {
        let suffix = number(end)?;
        if suffix == 0 || size == 0 {
            return Some(Err(()));
        }
        (size.saturating_sub(suffix.min(MAX_RANGE_LEN)), size - 1)
    } else {
        let start = number(start)?;
        let requested_end = if end.is_empty() {
            None
        } else {
            Some(number(end)?)
        };
        if requested_end.is_some_and(|end| end < start) {
            return None;
        }
        if start >= size {
            return Some(Err(()));
        }
        (
            start,
            requested_end
                .unwrap_or(size - 1)
                .min(size - 1)
                .min(start.saturating_add(MAX_RANGE_LEN - 1)),
        )
    };
    Some(Ok((start, end)))
}

pub fn respond(request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    if request.method() == "OPTIONS" {
        return Response::builder()
            .status(StatusCode::NO_CONTENT)
            .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .header(ACCESS_CONTROL_ALLOW_METHODS, "GET, OPTIONS")
            .header(ACCESS_CONTROL_ALLOW_HEADERS, "Range, Content-Type")
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
            );
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

    let mut file = match std::fs::File::open(&file_path) {
        Ok(file) => file,
        Err(_) => return build_error_response(StatusCode::NOT_FOUND, "File not found"),
    };
    let size = match file.metadata() {
        Ok(metadata) => metadata.len(),
        Err(_) => return build_error_response(StatusCode::NOT_FOUND, "File not found"),
    };
    let range = if request.headers().get_all(RANGE).iter().count() == 1 {
        request
            .headers()
            .get(RANGE)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| parse_range(value, size))
    } else {
        None
    };
    let mut response = Response::builder()
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(ACCESS_CONTROL_ALLOW_METHODS, "GET, OPTIONS")
        .header(CACHE_CONTROL, "no-store");
    let mut bytes = Vec::new();
    match range {
        Some(Err(())) => {
            return response
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header(CONTENT_TYPE, "text/plain; charset=utf-8")
                .header(CONTENT_RANGE, format!("bytes */{size}"))
                .header(
                    ACCESS_CONTROL_EXPOSE_HEADERS,
                    "Content-Range, Accept-Ranges, Content-Length",
                )
                .body(bytes)
                .unwrap();
        }
        Some(Ok((start, end))) => {
            bytes.resize((end - start + 1) as usize, 0);
            if file
                .seek(SeekFrom::Start(start))
                .and_then(|_| file.read_exact(&mut bytes))
                .is_err()
            {
                return build_error_response(StatusCode::NOT_FOUND, "File not found");
            }
            response = response
                .status(StatusCode::PARTIAL_CONTENT)
                .header(CONTENT_RANGE, format!("bytes {start}-{end}/{size}"));
        }
        None => {
            if file.read_to_end(&mut bytes).is_err() {
                return build_error_response(StatusCode::NOT_FOUND, "File not found");
            }
            response = response.status(StatusCode::OK);
        }
    }
    response
        .header(CONTENT_TYPE, content_type)
        .header(ACCEPT_RANGES, "bytes")
        .header(
            ACCESS_CONTROL_EXPOSE_HEADERS,
            "Content-Range, Accept-Ranges, Content-Length",
        )
        .header(CONTENT_LENGTH, bytes.len())
        .body(bytes)
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn request(path: &Path, extension: &str, range: Option<&str>) -> Response<Vec<u8>> {
        let mut url = Url::parse(&format!("http://localhost/media.{extension}")).unwrap();
        url.query_pairs_mut()
            .append_pair("path", path.to_str().unwrap());
        let uri = format!("{}?{}", url.path(), url.query().unwrap());
        let mut builder = Request::builder().uri(uri);
        if let Some(range) = range {
            builder = builder.header(RANGE, range);
        }
        respond(&builder.body(Vec::new()).unwrap())
    }

    #[test]
    fn serves_ranges_and_preserves_errors() {
        let temp = tempfile::tempdir().unwrap();
        let directory = temp.path().join("files");
        std::fs::create_dir(&directory).unwrap();
        let path = directory.join("video.mp4");
        let bytes: Vec<u8> = (0..3 * 1024 * 1024)
            .map(|i| ((i * 31 + i / 257) % 256) as u8)
            .collect();
        std::fs::write(&path, &bytes).unwrap();
        let size = bytes.len();

        let options = respond(
            &Request::builder()
                .method("OPTIONS")
                .body(Vec::new())
                .unwrap(),
        );
        assert_eq!(options.status(), StatusCode::NO_CONTENT);
        assert_eq!(
            options.headers()[ACCESS_CONTROL_ALLOW_HEADERS],
            "Range, Content-Type"
        );

        let full = request(&path, "mp4", None);
        assert_eq!(full.status(), StatusCode::OK);
        assert_eq!(full.headers()[ACCEPT_RANGES], "bytes");
        assert_eq!(full.body(), &bytes);
        assert_eq!(
            full.headers()[ACCESS_CONTROL_EXPOSE_HEADERS],
            "Content-Range, Accept-Ranges, Content-Length"
        );

        for (header, start, end) in [
            ("bytes=0-1".to_owned(), 0, 1),
            ("bytes=10-".to_owned(), 10, 10 + MAX_RANGE_LEN as usize - 1),
            ("bytes=-8".to_owned(), size - 8, size - 1),
            (
                format!("bytes={}-{}", size - 5, size + 100),
                size - 5,
                size - 1,
            ),
            (
                format!("bytes=-{}", size * 2),
                size - MAX_RANGE_LEN as usize,
                size - 1,
            ),
            (
                "bytes=-2097152".to_owned(),
                size - MAX_RANGE_LEN as usize,
                size - 1,
            ),
        ] {
            let response = request(&path, "mp4", Some(&header));
            assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT, "{header}");
            assert_eq!(
                response.headers()[CONTENT_RANGE],
                format!("bytes {start}-{end}/{size}")
            );
            assert_eq!(
                response.headers()[CONTENT_LENGTH],
                (end - start + 1).to_string()
            );
            assert_eq!(response.headers()[ACCEPT_RANGES], "bytes");
            assert_eq!(response.headers()[CONTENT_TYPE], "video/mp4");
            assert_eq!(
                response.headers()[ACCESS_CONTROL_EXPOSE_HEADERS],
                "Content-Range, Accept-Ranges, Content-Length"
            );
            assert_eq!(response.body(), &bytes[start..=end]);
        }
        for header in [
            format!("bytes={size}-"),
            format!("bytes={}-", size + 1),
            "bytes=-0".to_owned(),
        ] {
            let response = request(&path, "mp4", Some(&header));
            assert_eq!(response.status(), StatusCode::RANGE_NOT_SATISFIABLE);
            assert_eq!(response.headers()[CONTENT_RANGE], format!("bytes */{size}"));
            assert_eq!(
                response.headers()[ACCESS_CONTROL_EXPOSE_HEADERS],
                "Content-Range, Accept-Ranges, Content-Length"
            );
        }
        for header in [
            "bytes=abc",
            "items=0-1",
            "bytes=0-1,4-5",
            "bytes=5-4",
            "bytes=-",
        ] {
            let response = request(&path, "mp4", Some(header));
            assert_eq!(response.status(), StatusCode::OK, "{header}");
            assert_eq!(response.body(), &bytes);
        }
        assert_eq!(
            request(&temp.path().join("video.mp4"), "mp4", None).status(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            request(&path, "unknown", None).status(),
            StatusCode::BAD_REQUEST
        );

        std::fs::write(&path, []).unwrap();
        let empty = request(&path, "mp4", Some("bytes=0-1"));
        assert_eq!(empty.status(), StatusCode::RANGE_NOT_SATISFIABLE);
        assert_eq!(empty.headers()[CONTENT_RANGE], "bytes */0");
        assert_eq!(
            empty.headers()[ACCESS_CONTROL_EXPOSE_HEADERS],
            "Content-Range, Accept-Ranges, Content-Length"
        );
    }
}
