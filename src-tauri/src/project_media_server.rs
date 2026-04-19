use std::sync::Arc;

#[cfg(any(target_os = "macos", test))]
use std::{fs, path::PathBuf};
#[cfg(target_os = "macos")]
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom, Write},
    net::{TcpListener, TcpStream},
    thread,
};

use tauri::State;
#[cfg(target_os = "macos")]
use url::Url;

#[cfg(target_os = "macos")]
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

#[derive(Clone)]
pub struct ProjectMediaServerState {
    origin: Option<Arc<str>>,
}

impl ProjectMediaServerState {
    pub fn new() -> Self {
        Self {
            origin: start_project_media_server().map(Arc::<str>::from),
        }
    }

    fn origin(&self) -> Option<String> {
        self.origin.as_deref().map(str::to_string)
    }
}

#[tauri::command]
pub fn get_project_media_server_origin(
    state: State<'_, ProjectMediaServerState>,
) -> Option<String> {
    state.origin()
}

fn start_project_media_server() -> Option<String> {
    #[cfg(not(target_os = "macos"))]
    return None;

    #[cfg(target_os = "macos")]
    {
        let listener = TcpListener::bind(("127.0.0.1", 0)).ok()?;
        let address = listener.local_addr().ok()?;
        thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(stream) = stream else {
                    continue;
                };
                thread::spawn(move || {
                    let _ = handle_connection(stream);
                });
            }
        });
        Some(format!("http://127.0.0.1:{}", address.port()))
    }
}

#[cfg(target_os = "macos")]
fn handle_connection(mut stream: TcpStream) -> std::io::Result<()> {
    let request = read_request_head(&mut stream)?;
    let mut lines = request.split("\r\n");
    let request_line = lines.next().unwrap_or_default();
    let mut request_line_parts = request_line.split_whitespace();
    let method = request_line_parts.next().unwrap_or_default();
    let target = request_line_parts.next().unwrap_or_default();

    if method == "OPTIONS" {
        return write_simple_response(&mut stream, 204, "No Content", None, &[]);
    }

    if method != "GET" && method != "HEAD" {
        return write_simple_response(&mut stream, 405, "Method Not Allowed", None, &[]);
    }

    let range_header = lines.find_map(|line| {
        let (name, value) = line.split_once(':')?;
        name.trim()
            .eq_ignore_ascii_case("range")
            .then_some(value.trim().to_string())
    });

    let request_url = match Url::parse(&format!("http://localhost{target}")) {
        Ok(url) => url,
        Err(_) => {
            return write_simple_response(&mut stream, 400, "Bad Request", None, b"Invalid URL");
        }
    };

    let file_path = request_url
        .query_pairs()
        .find(|(key, _)| key == "path")
        .map(|(_, value)| value.into_owned());
    let Some(file_path) = file_path else {
        return write_simple_response(&mut stream, 400, "Bad Request", None, b"Missing file path");
    };

    let Some(file_path) = resolve_allowed_project_file_path(&file_path) else {
        return write_simple_response(
            &mut stream,
            400,
            "Bad Request",
            None,
            b"Unsupported file path",
        );
    };

    let Some(content_type) = get_media_mime_from_request_path(request_url.path()) else {
        return write_simple_response(
            &mut stream,
            400,
            "Bad Request",
            None,
            b"Unsupported media extension",
        );
    };

    let mut file = match File::open(&file_path) {
        Ok(file) => file,
        Err(_) => {
            return write_simple_response(&mut stream, 404, "Not Found", None, b"File not found");
        }
    };

    let file_size = match file.metadata() {
        Ok(metadata) => metadata.len(),
        Err(_) => {
            return write_simple_response(
                &mut stream,
                500,
                "Internal Server Error",
                None,
                b"Failed to read file metadata",
            );
        }
    };

    let range = match parse_byte_range(range_header.as_deref(), file_size) {
        Ok(range) => range,
        Err(_) => {
            return write_simple_response(
                &mut stream,
                416,
                "Range Not Satisfiable",
                Some(&[("Content-Range", format!("bytes */{file_size}"))]),
                &[],
            );
        }
    };

    let extra_headers = if let Some((start, end)) = range {
        let content_length = end - start + 1;
        file.seek(SeekFrom::Start(start))?;
        write_headers(
            &mut stream,
            206,
            "Partial Content",
            content_type,
            content_length,
            Some(&[
                ("Accept-Ranges", "bytes".to_string()),
                ("Content-Range", format!("bytes {start}-{end}/{file_size}")),
            ]),
        )?;
        Some(content_length)
    } else {
        write_headers(
            &mut stream,
            200,
            "OK",
            content_type,
            file_size,
            Some(&[("Accept-Ranges", "bytes".to_string())]),
        )?;
        None
    };

    if method == "HEAD" {
        return Ok(());
    }

    if let Some(content_length) = extra_headers {
        std::io::copy(&mut file.take(content_length), &mut stream)?;
    } else {
        std::io::copy(&mut file, &mut stream)?;
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn read_request_head(stream: &mut TcpStream) -> std::io::Result<String> {
    let mut buffer = [0_u8; 4096];
    let mut request = Vec::new();

    loop {
        let bytes_read = stream.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        request.extend_from_slice(&buffer[..bytes_read]);

        if request.windows(4).any(|window| window == b"\r\n\r\n") || request.len() > 64 * 1024 {
            break;
        }
    }

    Ok(String::from_utf8_lossy(&request).into_owned())
}

#[cfg(target_os = "macos")]
fn parse_byte_range(header: Option<&str>, file_size: u64) -> Result<Option<(u64, u64)>, ()> {
    let Some(header) = header else {
        return Ok(None);
    };

    let range = header.strip_prefix("bytes=").ok_or(())?;
    let (start_raw, end_raw) = range.split_once('-').ok_or(())?;

    if start_raw.is_empty() {
        let suffix_length = end_raw.parse::<u64>().map_err(|_| ())?;
        if suffix_length == 0 || file_size == 0 {
            return Err(());
        }
        let start = file_size.saturating_sub(suffix_length);
        return Ok(Some((start, file_size - 1)));
    }

    let start = start_raw.parse::<u64>().map_err(|_| ())?;
    if start >= file_size {
        return Err(());
    }

    let end = if end_raw.is_empty() {
        file_size - 1
    } else {
        end_raw.parse::<u64>().map_err(|_| ())?
    };

    if end < start {
        return Err(());
    }

    Ok(Some((start, end.min(file_size - 1))))
}

#[cfg(any(target_os = "macos", test))]
fn resolve_allowed_project_file_path(path: &str) -> Option<PathBuf> {
    let canonical_path = fs::canonicalize(path).ok()?;
    if !canonical_path.is_file() {
        return None;
    }

    let project_files_root = canonical_path.ancestors().find(|candidate| {
        candidate
            .file_name()
            .is_some_and(|file_name| file_name == "files")
            && candidate
                .parent()
                .is_some_and(|project_root| project_root.join("project.db").is_file())
    })?;

    canonical_path
        .starts_with(project_files_root)
        .then_some(canonical_path)
}

#[cfg(target_os = "macos")]
fn get_media_mime_from_request_path(path: &str) -> Option<&'static str> {
    let normalized_path = path.to_ascii_lowercase();

    MEDIA_MIME_BY_EXTENSION
        .iter()
        .find_map(|(extension, mime)| normalized_path.ends_with(extension).then_some(*mime))
}

#[cfg(target_os = "macos")]
fn write_headers(
    stream: &mut TcpStream,
    status_code: u16,
    status_text: &str,
    content_type: &str,
    content_length: u64,
    extra_headers: Option<&[(&str, String)]>,
) -> std::io::Result<()> {
    write!(
        stream,
        "HTTP/1.1 {status_code} {status_text}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n\
         Access-Control-Allow-Headers: Range, Content-Type\r\n\
         Cache-Control: no-store\r\n\
         Connection: close\r\n\
         Content-Type: {content_type}\r\n\
         Content-Length: {content_length}\r\n"
    )?;

    if let Some(extra_headers) = extra_headers {
        for (name, value) in extra_headers {
            write!(stream, "{name}: {value}\r\n")?;
        }
    }

    write!(stream, "\r\n")?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn write_simple_response(
    stream: &mut TcpStream,
    status_code: u16,
    status_text: &str,
    extra_headers: Option<&[(&str, String)]>,
    body: &[u8],
) -> std::io::Result<()> {
    write!(
        stream,
        "HTTP/1.1 {status_code} {status_text}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n\
         Access-Control-Allow-Headers: Range, Content-Type\r\n\
         Cache-Control: no-store\r\n\
         Connection: close\r\n\
         Content-Type: text/plain; charset=utf-8\r\n\
         Content-Length: {}\r\n",
        body.len()
    )?;

    if let Some(extra_headers) = extra_headers {
        for (name, value) in extra_headers {
            write!(stream, "{name}: {value}\r\n")?;
        }
    }

    write!(stream, "\r\n")?;
    stream.write_all(body)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::resolve_allowed_project_file_path;
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn create_test_root(label: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock before unix epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "routevn-project-media-server-{label}-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&root).expect("create test root");
        root
    }

    #[test]
    fn accepts_files_under_a_project_files_directory() {
        let root = create_test_root("allow");
        let result = (|| {
            let project_root = root.join("project");
            let files_root = project_root.join("files");
            let asset_path = files_root.join("nested").join("image.png");

            fs::create_dir_all(asset_path.parent().expect("asset parent"))
                .expect("create files tree");
            fs::write(project_root.join("project.db"), b"db").expect("write project db");
            fs::write(&asset_path, b"image").expect("write asset");

            let resolved =
                resolve_allowed_project_file_path(asset_path.to_str().expect("asset path string"));

            assert_eq!(resolved, fs::canonicalize(&asset_path).ok());
        })();

        fs::remove_dir_all(&root).expect("cleanup allow test root");
        result
    }

    #[test]
    fn rejects_paths_outside_the_project_files_directory() {
        let root = create_test_root("deny");
        let result = (|| {
            let project_root = root.join("project");
            let files_root = project_root.join("files");
            let escaped_root = root.join("escaped");
            let asset_path = files_root.join("nested").join("image.png");
            let escaped_path = escaped_root.join("secret.txt");

            fs::create_dir_all(asset_path.parent().expect("asset parent"))
                .expect("create files tree");
            fs::create_dir_all(&escaped_root).expect("create escaped root");
            fs::write(project_root.join("project.db"), b"db").expect("write project db");
            fs::write(&asset_path, b"image").expect("write asset");
            fs::write(&escaped_path, b"secret").expect("write escaped file");

            let traversed_path = files_root
                .join("..")
                .join("..")
                .join("escaped")
                .join("secret.txt");
            let resolved = resolve_allowed_project_file_path(
                traversed_path.to_str().expect("traversed path string"),
            );

            assert_eq!(resolved, None);
        })();

        fs::remove_dir_all(&root).expect("cleanup deny test root");
        result
    }
}
