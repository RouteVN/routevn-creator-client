use serde::Serialize;
use std::{
    collections::HashMap,
    fs::{self, File},
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc::{self, Receiver, Sender},
        Mutex,
    },
    thread::{self, JoinHandle},
    time::Duration,
};
use tauri::State;
use url::Url;

const SERVER_POLL_INTERVAL_MS: u64 = 25;
const CLIENT_SOCKET_TIMEOUT_SECS: u64 = 300;
const STATIC_WEB_SERVER_START_PORT: u16 = 38181;

fn log_static_web_server_error(message: &str) {
    eprintln!("[static_web_server] {message}");
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StaticWebServerInfo {
    pub server_id: String,
    pub root_path: String,
    pub url: String,
}

struct RunningStaticWebServer {
    root_path: PathBuf,
    info: StaticWebServerInfo,
    stop_tx: Sender<()>,
    thread: Option<JoinHandle<()>>,
}

pub struct StaticWebServerState {
    next_id: AtomicU64,
    servers: Mutex<HashMap<String, RunningStaticWebServer>>,
}

impl StaticWebServerState {
    pub fn new() -> Self {
        Self {
            next_id: AtomicU64::new(1),
            servers: Mutex::new(HashMap::new()),
        }
    }

    fn take_all_servers(&self) -> Vec<RunningStaticWebServer> {
        let mut servers = match self.servers.lock() {
            Ok(servers) => servers,
            Err(error) => {
                log_static_web_server_error(&format!(
                    "server state lock poisoned during shutdown: {}",
                    error
                ));
                error.into_inner()
            }
        };

        servers.drain().map(|(_, server)| server).collect()
    }
}

impl Drop for StaticWebServerState {
    fn drop(&mut self) {
        let servers = self.take_all_servers();
        for server in servers {
            stop_running_server(server);
        }
    }
}

enum RequestedFilePathError {
    BadRequest,
    NotFound,
}

#[tauri::command]
pub fn start_static_web_server(
    root_path: String,
    state: State<'_, StaticWebServerState>,
) -> Result<StaticWebServerInfo, String> {
    let canonical_root = resolve_static_site_root(&root_path)?;
    let mut servers = match state.servers.lock() {
        Ok(servers) => servers,
        Err(error) => {
            log_static_web_server_error(&format!(
                "failed to lock server state for root {:?}: {}",
                canonical_root, error
            ));
            return Err("Failed to manage the web server.".to_string());
        }
    };

    if let Some(existing) = servers
        .values()
        .find(|server| server.root_path == canonical_root)
    {
        return Ok(existing.info.clone());
    }

    let listener = match bind_static_web_server_listener(&canonical_root) {
        Ok(listener) => listener,
        Err(error) => return Err(error),
    };
    if let Err(error) = listener.set_nonblocking(true) {
        log_static_web_server_error(&format!(
            "failed to set nonblocking listener for root {:?}: {}",
            canonical_root, error
        ));
        return Err("Failed to start the web server.".to_string());
    }
    let address = match listener.local_addr() {
        Ok(address) => address,
        Err(error) => {
            log_static_web_server_error(&format!(
                "failed to read listener address for root {:?}: {}",
                canonical_root, error
            ));
            return Err("Failed to start the web server.".to_string());
        }
    };

    let server_id = state.next_id.fetch_add(1, Ordering::Relaxed).to_string();
    let server_info = StaticWebServerInfo {
        server_id: server_id.clone(),
        root_path: canonical_root.to_string_lossy().to_string(),
        url: format!("http://127.0.0.1:{}/", address.port()),
    };

    let (stop_tx, stop_rx) = mpsc::channel();
    let server_root = canonical_root.clone();
    let thread = thread::spawn(move || {
        run_static_web_server(listener, server_root, stop_rx);
    });

    servers.insert(
        server_id,
        RunningStaticWebServer {
            root_path: canonical_root,
            info: server_info.clone(),
            stop_tx,
            thread: Some(thread),
        },
    );

    Ok(server_info)
}

#[tauri::command]
pub fn stop_static_web_server(
    server_id: String,
    state: State<'_, StaticWebServerState>,
) -> Result<bool, String> {
    let server = {
        let mut servers = match state.servers.lock() {
            Ok(servers) => servers,
            Err(error) => {
                log_static_web_server_error(&format!(
                    "failed to lock server state while stopping server {}: {}",
                    server_id, error
                ));
                return Err("Failed to manage the web server.".to_string());
            }
        };
        servers.remove(&server_id)
    };

    let Some(server) = server else {
        return Ok(false);
    };

    stop_running_server(server);

    Ok(true)
}

#[tauri::command]
pub fn list_static_web_servers(
    state: State<'_, StaticWebServerState>,
) -> Result<Vec<StaticWebServerInfo>, String> {
    let servers = match state.servers.lock() {
        Ok(servers) => servers,
        Err(error) => {
            log_static_web_server_error(&format!(
                "failed to lock server state while listing servers: {}",
                error
            ));
            return Err("Failed to manage the web server.".to_string());
        }
    };

    let mut items = servers
        .values()
        .map(|server| server.info.clone())
        .collect::<Vec<_>>();
    items.sort_by(|left, right| left.root_path.cmp(&right.root_path));

    Ok(items)
}

fn stop_running_server(mut server: RunningStaticWebServer) {
    let _ = server.stop_tx.send(());
    if let Some(thread) = server.thread.take() {
        let _ = thread.join();
    }
}

fn bind_static_web_server_listener(root_path: &Path) -> Result<TcpListener, String> {
    for port in STATIC_WEB_SERVER_START_PORT..=u16::MAX {
        match TcpListener::bind(("127.0.0.1", port)) {
            Ok(listener) => return Ok(listener),
            Err(error) if error.kind() == std::io::ErrorKind::AddrInUse => continue,
            Err(error) => {
                log_static_web_server_error(&format!(
                    "failed to bind listener for root {:?} on port {}: {}",
                    root_path, port, error
                ));
                return Err("Failed to start the web server.".to_string());
            }
        }
    }

    log_static_web_server_error(&format!(
        "failed to find an available listener port for root {:?} starting from {}",
        root_path, STATIC_WEB_SERVER_START_PORT
    ));
    Err("Failed to start the web server.".to_string())
}

fn resolve_static_site_root(path: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty() {
        log_static_web_server_error("empty root path received");
        return Err("Please select a valid folder.".to_string());
    }

    let canonical_root = match fs::canonicalize(path) {
        Ok(path) => path,
        Err(error) => {
            log_static_web_server_error(&format!(
                "failed to canonicalize root path {:?}: {}",
                path, error
            ));
            return Err("Please select a valid folder.".to_string());
        }
    };

    if !canonical_root.is_dir() {
        log_static_web_server_error(&format!(
            "root path is not a directory: {:?}",
            canonical_root
        ));
        return Err("Please select a valid folder.".to_string());
    }

    let index_html_path = canonical_root.join("index.html");

    if !index_html_path.is_file() {
        log_static_web_server_error(&format!(
            "missing index.html under root {:?}",
            canonical_root
        ));
        return Err("Selected folder must contain an index.html file.".to_string());
    }

    Ok(canonical_root)
}

fn run_static_web_server(listener: TcpListener, root_path: PathBuf, stop_rx: Receiver<()>) {
    loop {
        if stop_rx.try_recv().is_ok() {
            break;
        }

        match listener.accept() {
            Ok((stream, _address)) => {
                let request_root = root_path.clone();
                thread::spawn(move || {
                    if let Err(error) = stream.set_nonblocking(false) {
                        log_static_web_server_error(&format!(
                            "failed to set client stream blocking mode for root {:?}: {}",
                            request_root, error
                        ));
                        return;
                    }

                    let timeout = Duration::from_secs(CLIENT_SOCKET_TIMEOUT_SECS);
                    if let Err(error) = stream.set_read_timeout(Some(timeout)) {
                        log_static_web_server_error(&format!(
                            "failed to set client read timeout for root {:?}: {}",
                            request_root, error
                        ));
                        return;
                    }

                    if let Err(error) = stream.set_write_timeout(Some(timeout)) {
                        log_static_web_server_error(&format!(
                            "failed to set client write timeout for root {:?}: {}",
                            request_root, error
                        ));
                        return;
                    }

                    if let Err(error) = handle_connection(stream, &request_root) {
                        log_static_web_server_error(&format!(
                            "request handling failed for root {:?}: {}",
                            request_root, error
                        ));
                    }
                });
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(SERVER_POLL_INTERVAL_MS));
            }
            Err(_) => {
                thread::sleep(Duration::from_millis(SERVER_POLL_INTERVAL_MS));
            }
        }
    }
}

fn handle_connection(mut stream: TcpStream, root_path: &Path) -> std::io::Result<()> {
    let request = read_request_head(&mut stream)?;
    let mut lines = request.split("\r\n");
    let request_line = lines.next().unwrap_or_default();
    let mut request_line_parts = request_line.split_whitespace();
    let method = request_line_parts.next().unwrap_or_default();
    let target = request_line_parts.next().unwrap_or_default();

    if method == "OPTIONS" {
        return write_simple_response(&mut stream, 204, "No Content", &[]);
    }

    if method != "GET" && method != "HEAD" {
        return write_simple_response(
            &mut stream,
            405,
            "Method Not Allowed",
            b"Method not allowed",
        );
    }

    let request_url = match Url::parse(&format!("http://localhost{target}")) {
        Ok(url) => url,
        Err(_) => {
            return write_simple_response(&mut stream, 400, "Bad Request", b"Invalid URL");
        }
    };

    let file_path = match resolve_requested_file_path(root_path, &request_url) {
        Ok(path) => path,
        Err(RequestedFilePathError::BadRequest) => {
            return write_simple_response(&mut stream, 400, "Bad Request", b"Invalid path");
        }
        Err(RequestedFilePathError::NotFound) => {
            return write_simple_response(&mut stream, 404, "Not Found", b"File not found");
        }
    };

    let mut file = match File::open(&file_path) {
        Ok(file) => file,
        Err(_) => {
            return write_simple_response(&mut stream, 404, "Not Found", b"File not found");
        }
    };

    let file_size = match file.metadata() {
        Ok(metadata) => metadata.len(),
        Err(_) => {
            return write_simple_response(
                &mut stream,
                500,
                "Internal Server Error",
                b"Failed to read file metadata",
            );
        }
    };

    write_headers(
        &mut stream,
        200,
        "OK",
        get_content_type(&file_path),
        file_size,
    )?;

    if method == "HEAD" {
        return Ok(());
    }

    std::io::copy(&mut file, &mut stream)?;

    Ok(())
}

fn resolve_requested_file_path(
    root_path: &Path,
    request_url: &Url,
) -> Result<PathBuf, RequestedFilePathError> {
    let mut relative_path = PathBuf::new();
    let Some(segments) = request_url.path_segments() else {
        return Err(RequestedFilePathError::BadRequest);
    };

    for segment in segments {
        if segment.is_empty() {
            continue;
        }

        let decoded_segment =
            urlencoding::decode(segment).map_err(|_| RequestedFilePathError::BadRequest)?;
        let decoded_segment = decoded_segment.as_ref();

        if decoded_segment == "."
            || decoded_segment == ".."
            || decoded_segment.contains('/')
            || decoded_segment.contains('\\')
        {
            return Err(RequestedFilePathError::BadRequest);
        }

        relative_path.push(decoded_segment);
    }

    let requested_path = root_path.join(relative_path);
    let candidate_path = if requested_path.is_dir() {
        requested_path.join("index.html")
    } else {
        requested_path
    };

    if !candidate_path.exists() {
        return Err(RequestedFilePathError::NotFound);
    }

    let canonical_path =
        fs::canonicalize(&candidate_path).map_err(|_| RequestedFilePathError::NotFound)?;

    if !canonical_path.starts_with(root_path) || !canonical_path.is_file() {
        return Err(RequestedFilePathError::BadRequest);
    }

    Ok(canonical_path)
}

fn get_content_type(path: &Path) -> &'static str {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    match extension.as_str() {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" | "cjs" => "application/javascript; charset=utf-8",
        "json" | "map" => "application/json; charset=utf-8",
        "txt" => "text/plain; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "wasm" => "application/wasm",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        _ => "application/octet-stream",
    }
}

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

fn write_headers(
    stream: &mut TcpStream,
    status_code: u16,
    status_text: &str,
    content_type: &str,
    content_length: u64,
) -> std::io::Result<()> {
    write!(
        stream,
        concat!(
            "HTTP/1.1 {} {}\r\n",
            "Access-Control-Allow-Origin: *\r\n",
            "Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n",
            "Access-Control-Allow-Headers: Content-Type\r\n",
            "Cache-Control: no-store\r\n",
            "Connection: close\r\n",
            "Content-Type: {}\r\n",
            "Content-Length: {}\r\n",
            "\r\n"
        ),
        status_code, status_text, content_type, content_length
    )?;

    Ok(())
}

fn write_simple_response(
    stream: &mut TcpStream,
    status_code: u16,
    status_text: &str,
    body: &[u8],
) -> std::io::Result<()> {
    write!(
        stream,
        concat!(
            "HTTP/1.1 {} {}\r\n",
            "Access-Control-Allow-Origin: *\r\n",
            "Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n",
            "Access-Control-Allow-Headers: Content-Type\r\n",
            "Cache-Control: no-store\r\n",
            "Connection: close\r\n",
            "Content-Type: text/plain; charset=utf-8\r\n",
            "Content-Length: {}\r\n",
            "\r\n"
        ),
        status_code,
        status_text,
        body.len()
    )?;

    stream.write_all(body)?;
    Ok(())
}
