//! A general native download: stream one URL into a new file. It knows nothing
//! about what is downloaded or why; callers decide that. Rules every caller gets:
//! https only (http for loopback hosts), no credentials in the URL, at most five
//! redirects with every hop checked again, a connect and a stalled-read timeout,
//! a byte limit, a new destination file that is never overwritten, and the
//! partial file removed on failure. See "Native contract" in
//! `docs/project-import.md`.

use std::fmt::Display;
use std::path::Path;
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde::Serialize;
use tokio::io::AsyncWriteExt;
use url::Url;

pub const INVALID_URL: &str = "invalidUrl";
pub const DOWNLOAD_FAILED: &str = "downloadFailed";
pub const TOO_LARGE: &str = "tooLarge";
pub const WRITE_FAILED: &str = "writeFailed";

const MAX_REDIRECTS: u32 = 5;
const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);

pub fn err(code: &str, detail: impl Display) -> String {
    format!("{code}: {detail}")
}

// ---------- Progress ----------

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEvent {
    pub current: u64,
    pub total: u64,
}

/// Sends `{ current, total }` events: `emit` always sends (first and last
/// event), `report` sends at most one event per 100 ms. Delivery is best
/// effort, so the sender cannot fail the operation.
pub struct ProgressSink {
    send: Box<dyn Fn(ProgressEvent) + Send + Sync>,
    last_sent: Option<Instant>,
}

impl ProgressSink {
    pub fn new(send: impl Fn(ProgressEvent) + Send + Sync + 'static) -> Self {
        Self {
            send: Box::new(send),
            last_sent: None,
        }
    }

    pub fn emit(&mut self, current: u64, total: u64) {
        (self.send)(ProgressEvent { current, total });
        self.last_sent = Some(Instant::now());
    }

    pub fn report(&mut self, current: u64, total: u64) {
        if self
            .last_sent
            .is_none_or(|last| last.elapsed() >= PROGRESS_INTERVAL)
        {
            self.emit(current, total);
        }
    }
}

pub fn channel_sink(channel: tauri::ipc::Channel<ProgressEvent>) -> ProgressSink {
    ProgressSink::new(move |event| {
        let _ = channel.send(event);
    })
}

// ---------- download_file ----------

fn is_loopback_host(url: &Url) -> bool {
    matches!(
        url.host(),
        Some(url::Host::Domain("localhost"))
            | Some(url::Host::Ipv4(std::net::Ipv4Addr::LOCALHOST))
            | Some(url::Host::Ipv6(std::net::Ipv6Addr::LOCALHOST))
    )
}

fn validate_url(url: &Url) -> Result<(), String> {
    if !url.username().is_empty() || url.password().is_some() {
        return Err(err(INVALID_URL, "credentials in URL are not allowed"));
    }
    let scheme = url.scheme();
    if scheme == "https" || (scheme == "http" && is_loopback_host(url)) {
        return Ok(());
    }
    Err(err(
        INVALID_URL,
        format!("scheme {scheme} is not allowed for this host"),
    ))
}

fn build_http_client() -> Result<reqwest::Client, String> {
    // rustls-no-provider reqwest builds need a process-default CryptoProvider.
    // Install the ring provider once, mirroring error_reporting::init; if a
    // provider is already installed (production startup), this is a no-op.
    static INSTALL_TLS_PROVIDER: std::sync::Once = std::sync::Once::new();
    INSTALL_TLS_PROVIDER.call_once(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
    // The bytes are saved as the server sends them, on every platform.
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::ACCEPT_ENCODING,
        reqwest::header::HeaderValue::from_static("identity"),
    );
    reqwest::Client::builder()
        .default_headers(headers)
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| err(DOWNLOAD_FAILED, error))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResult {
    pub final_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_disposition: Option<String>,
    pub bytes: u64,
}

// Redirects are followed by hand so every hop passes the same URL check. The
// body is streamed chunk by chunk and never held in memory.
async fn fetch_into(
    client: &reqwest::Client,
    start_url: Url,
    writer: &mut tokio::fs::File,
    max_bytes: u64,
    progress: &mut ProgressSink,
) -> Result<DownloadResult, String> {
    let mut current = start_url;
    let mut redirects = 0u32;
    let response = loop {
        validate_url(&current)?;
        let response = client
            .get(current.clone())
            .send()
            .await
            .map_err(|error| err(DOWNLOAD_FAILED, error))?;
        let status = response.status();
        if !status.is_redirection() {
            if !status.is_success() {
                return Err(err(DOWNLOAD_FAILED, format!("HTTP {status}")));
            }
            break response;
        }
        if redirects >= MAX_REDIRECTS {
            return Err(err(
                DOWNLOAD_FAILED,
                format!("too many redirects (HTTP {status})"),
            ));
        }
        let location = response
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|value| value.to_str().ok())
            .ok_or_else(|| {
                err(
                    DOWNLOAD_FAILED,
                    format!("redirect without location (HTTP {status})"),
                )
            })?;
        redirects += 1;
        current = current
            .join(location)
            .map_err(|error| err(INVALID_URL, error))?;
    };

    let content_length = response.content_length().unwrap_or(0);
    if content_length > max_bytes {
        return Err(err(
            TOO_LARGE,
            format!("server declares {content_length} bytes, limit is {max_bytes}"),
        ));
    }
    let content_disposition = response
        .headers()
        .get(reqwest::header::CONTENT_DISPOSITION)
        .map(|value| String::from_utf8_lossy(value.as_bytes()).into_owned());

    // The first event waits for the response headers so the caller can keep
    // showing "connecting" until the server answers.
    progress.emit(0, content_length);
    let mut stream = response.bytes_stream();
    let mut bytes = 0u64;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| err(DOWNLOAD_FAILED, error))?;
        bytes += chunk.len() as u64;
        if bytes > max_bytes {
            return Err(err(
                TOO_LARGE,
                format!("download passed the limit of {max_bytes} bytes"),
            ));
        }
        writer
            .write_all(&chunk)
            .await
            .map_err(|error| err(WRITE_FAILED, error))?;
        progress.report(bytes, content_length);
    }
    writer
        .flush()
        .await
        .map_err(|error| err(WRITE_FAILED, error))?;
    progress.emit(bytes, content_length);
    Ok(DownloadResult {
        final_url: current.to_string(),
        content_disposition,
        bytes,
    })
}

async fn download(
    url: &str,
    destination: &Path,
    max_bytes: u64,
    progress: &mut ProgressSink,
) -> Result<DownloadResult, String> {
    let start_url = Url::parse(url).map_err(|error| err(INVALID_URL, error))?;
    validate_url(&start_url)?;
    let client = build_http_client()?;
    // The destination is new: an existing file is never overwritten, and it is
    // only deleted again (on failure) when this call created it.
    let mut writer = tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)
        .await
        .map_err(|error| {
            err(
                WRITE_FAILED,
                format!("cannot create {}: {error}", destination.display()),
            )
        })?;
    let result = fetch_into(&client, start_url, &mut writer, max_bytes, progress).await;
    drop(writer);
    if result.is_err() {
        let _ = tokio::fs::remove_file(destination).await;
    }
    result
}

#[tauri::command]
pub async fn download_file(
    url: String,
    destination: String,
    max_bytes: u64,
    on_progress: tauri::ipc::Channel<ProgressEvent>,
) -> Result<DownloadResult, String> {
    let mut progress = channel_sink(on_progress);
    download(&url, Path::new(&destination), max_bytes, &mut progress).await
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;
    use std::io::{Read, Write};
    use std::sync::{Arc, Mutex};

    pub(crate) type Events = Arc<Mutex<Vec<(u64, u64)>>>;

    /// A sink that records `(current, total)` for every event.
    pub(crate) fn recording() -> (ProgressSink, Events) {
        let events = Events::default();
        let received = Arc::clone(&events);
        let sink = ProgressSink::new(move |event| {
            received.lock().unwrap().push((event.current, event.total));
        });
        (sink, events)
    }

    // ----- download -----

    fn spawn_server(responses: Vec<String>) -> Url {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            for response in responses {
                let Ok((mut stream, _)) = listener.accept() else {
                    break;
                };
                let mut buf = [0u8; 8192];
                let _ = stream.read(&mut buf);
                let _ = stream.write_all(response.as_bytes());
                let _ = stream.flush();
            }
        });
        Url::parse(&format!("http://{addr}/archive.zip")).unwrap()
    }

    fn response(head: &str, body: &str) -> String {
        format!("HTTP/1.1 {head}\r\nConnection: close\r\n\r\n{body}")
    }

    fn ok_response(body: &str) -> String {
        response(&format!("200 OK\r\nContent-Length: {}", body.len()), body)
    }

    fn redirect_to(location: &str) -> String {
        response(
            &format!("302 Found\r\nLocation: {location}\r\nContent-Length: 0"),
            "",
        )
    }

    fn run_download(
        url: &str,
        destination: &Path,
        max_bytes: u64,
    ) -> (Result<DownloadResult, String>, Vec<(u64, u64)>) {
        let (mut sink, events) = recording();
        let result =
            tauri::async_runtime::block_on(download(url, destination, max_bytes, &mut sink));
        let events = events.lock().unwrap().clone();
        (result, events)
    }

    #[test]
    fn download_follows_five_redirects_and_returns_the_body_and_headers() {
        let body = "Project One archive ".repeat(10);
        let disposition =
            "attachment; filename*=UTF-8''Project%20One.zip; filename=\"Project One.zip\"";
        let mut responses = vec![redirect_to("/archive.zip"); 4];
        responses.push(redirect_to("/next.zip"));
        let head = format!("200 OK\r\nContent-Disposition: {disposition}");
        responses.push(response(&format!("{head}\r\nContent-Length: 200"), &body));
        let url = spawn_server(responses);
        let dir = tempfile::tempdir().unwrap();
        let destination = dir.path().join("download.zip");
        let (result, events) = run_download(url.as_str(), &destination, 1024);
        let json = serde_json::to_value(result.unwrap()).unwrap();
        assert_eq!(fs::read(&destination).unwrap(), body.as_bytes());
        assert_eq!(json["bytes"], 200);
        assert_eq!(json["finalUrl"], url.join("/next.zip").unwrap().as_str());
        assert_eq!(json["contentDisposition"], disposition);
        // The first event follows the response headers; the last ends the body.
        assert_eq!(events.first(), Some(&(0, 200)));
        assert_eq!(events.last(), Some(&(200, 200)));
    }

    #[test]
    fn download_asks_the_server_for_the_bytes_as_stored() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/a.bin", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = [0u8; 8192];
            let read = stream.read(&mut buf).unwrap();
            stream.write_all(ok_response("data").as_bytes()).unwrap();
            String::from_utf8_lossy(&buf[..read]).to_lowercase()
        });
        let dir = tempfile::tempdir().unwrap();
        run_download(&url, &dir.path().join("out"), 1024).0.unwrap();
        let request = server.join().unwrap();
        assert!(request.contains("accept-encoding: identity"), "{request}");
    }

    #[test]
    fn download_failures_leave_no_file_and_send_no_progress() {
        let not_found = spawn_server(vec![response("404 Not Found\r\nContent-Length: 0", "")]);
        let insecure_hop = spawn_server(vec![redirect_to("http://example.com/a.zip")]);
        // Five redirects are followed; the sixth is one too many.
        let redirect_loop = spawn_server(vec![redirect_to("/archive.zip"); 6]);
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let refused = format!("http://{}/a.zip", listener.local_addr().unwrap());
        drop(listener);
        let dir = tempfile::tempdir().unwrap();
        let destination = dir.path().join("a.zip");
        for (url, expected) in [
            ("https://user:secret@example.com/a.zip", "invalidUrl: "),
            ("https://user@example.com/a.zip", "invalidUrl: "),
            ("http://example.com/a.zip", "invalidUrl: "),
            ("ftp://127.0.0.1/a.zip", "invalidUrl: "),
            ("not a url", "invalidUrl: "),
            // Every redirect hop passes the same check.
            (insecure_hop.as_str(), "invalidUrl: "),
            (not_found.as_str(), "downloadFailed: HTTP 404"),
            (redirect_loop.as_str(), "downloadFailed: too many redirects"),
            (refused.as_str(), "downloadFailed: "),
        ] {
            let (result, events) = run_download(url, &destination, 1024);
            let error = result.unwrap_err();
            assert!(error.starts_with(expected), "{url}: {error}");
            assert!(!destination.exists(), "{url}");
            assert!(events.is_empty(), "{url}: {events:?}");
        }
    }

    #[test]
    fn download_enforces_max_bytes_and_never_overwrites_a_file() {
        let body = "x".repeat(4096);
        let dir = tempfile::tempdir().unwrap();
        let destination = dir.path().join("a.zip");
        // The declared length is too large, or (without one) the streamed bytes are.
        for response in [ok_response(&body), response("200 OK", &body)] {
            let url = spawn_server(vec![response]);
            let error = run_download(url.as_str(), &destination, 4095).0;
            assert!(error.unwrap_err().starts_with("tooLarge: "));
            assert!(!destination.exists());
        }
        let url = spawn_server(vec![ok_response(&body)]);
        let result = run_download(url.as_str(), &destination, 4096).0.unwrap();
        let json = serde_json::to_value(result).unwrap();
        assert_eq!(json, json!({ "finalUrl": url.as_str(), "bytes": 4096 }));
        // The destination is claimed before connecting, so no server is needed.
        let error = run_download("https://example.com/a.zip", &destination, 4096).0;
        assert!(error.unwrap_err().starts_with("writeFailed: "));
        assert_eq!(fs::read(&destination).unwrap(), body.as_bytes());
    }
}
