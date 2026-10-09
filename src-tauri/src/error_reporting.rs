use std::borrow::Cow;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use sentry::integrations::backtrace::ProcessStacktraceIntegration;
use sentry::integrations::debug_images::DebugImagesIntegration;
use sentry::integrations::panic::PanicIntegration;
use sentry::protocol::{
    DebugImage, DebugMeta, Event, Frame, Mechanism, Stacktrace, SymbolicDebugImage, User,
};
use sqlx::{
    Connection,
    sqlite::{SqliteConnectOptions, SqliteConnection},
};

const RELEASE: &str = concat!("routevn-creator@", env!("CARGO_PKG_VERSION"));
// Matches the webview limit; the panic hook also blocks while each event is sent.
const MAX_EVENTS_PER_SESSION: usize = 10;
static SENT_EVENTS: AtomicUsize = AtomicUsize::new(0);

// Set before sentry::init so native reports and the webview share one read.
static DEVICE_ID: OnceLock<Option<String>> = OnceLock::new();

fn is_device_id(value: &str) -> bool {
    value.len() == 24
        && value.bytes().all(|byte| {
            matches!(byte,
            b'1'..=b'9' | b'A'..=b'H' | b'J'..=b'N' | b'P'..=b'Z'
            | b'a'..=b'k' | b'm'..=b'z')
        })
}

// The SQL plugin resolves sqlite:app.db against Tauri's app_config_dir().
fn app_database_path() -> Option<PathBuf> {
    dirs::config_dir().map(|base| base.join("com.routevn.creator/app.db"))
}

fn read_device_id(file: &Path) -> Option<String> {
    if !file.is_file() {
        return None;
    }
    let options = SqliteConnectOptions::new()
        .filename(file)
        .read_only(true)
        .create_if_missing(false)
        // Not immutable: the app database runs in WAL mode, and the device ID
        // can still be only in the write-ahead log.
        .busy_timeout(Duration::from_millis(50));
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .ok()?;
    let id = runtime.block_on(async {
        tokio::time::timeout(Duration::from_millis(250), async {
            let mut connection = SqliteConnection::connect_with(&options).await.ok()?;
            let json: String =
                sqlx::query_scalar("SELECT value FROM kv WHERE key = 'deviceId' LIMIT 1")
                    .fetch_optional(&mut connection)
                    .await
                    .ok()??;
            let id: String = serde_json::from_str(&json).ok()?;
            is_device_id(&id).then_some(id)
        })
        .await
        .ok()
        .flatten()
    });
    runtime.shutdown_timeout(Duration::from_millis(50));
    id
}

fn safe_identifier(value: &str) -> Option<String> {
    (value.len() <= 200
        && !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"_:.<>$-".contains(&byte)))
    .then(|| value.to_owned())
}

fn safe_filename(value: &str) -> Option<String> {
    let basename = value.split(['?', '#']).next()?.rsplit(['/', '\\']).next()?;
    (basename.len() <= 120
        && !basename.is_empty()
        && basename
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"_.-".contains(&byte)))
    .then(|| basename.to_owned())
}

// Image names are file paths; keep only a plain basename, which may have spaces.
fn safe_image_name(value: &str) -> Option<String> {
    let basename = value.rsplit(['/', '\\']).next()?;
    (basename.len() <= 120
        && !basename.is_empty()
        && basename
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b" _.-".contains(&byte)))
    .then(|| basename.to_owned())
}

// Keep the loaded images that a sent frame points into, so its address can be
// matched to that build's symbols by debug ID. Paths are reduced to basenames.
fn scrub_debug_meta(debug_meta: &DebugMeta, addresses: &[u64]) -> DebugMeta {
    let images = debug_meta
        .images
        .iter()
        .filter_map(|image| match image {
            DebugImage::Symbolic(image) => {
                let start = image.image_addr.0;
                addresses
                    .iter()
                    .any(|address| {
                        address
                            .checked_sub(start)
                            .is_some_and(|offset| offset < image.image_size)
                    })
                    .then(|| {
                        DebugImage::Symbolic(SymbolicDebugImage {
                            name: safe_image_name(&image.name)
                                .unwrap_or_else(|| "unknown".to_owned()),
                            debug_file: image.debug_file.as_deref().and_then(safe_image_name),
                            ..image.clone()
                        })
                    })
            }
            _ => None,
        })
        .collect();
    DebugMeta {
        images,
        ..DebugMeta::default()
    }
}

fn scrub_stacktrace(stacktrace: &mut Stacktrace) {
    stacktrace.registers.clear();
    for frame in &mut stacktrace.frames {
        *frame = Frame {
            function: frame.function.as_deref().and_then(safe_identifier),
            filename: frame.filename.as_deref().and_then(safe_filename),
            lineno: frame.lineno,
            colno: frame.colno,
            in_app: frame.in_app,
            instruction_addr: frame.instruction_addr,
            ..Frame::default()
        };
    }
}

fn scrub_event(event: Event<'static>, device_id: Option<&str>) -> Event<'static> {
    let mut safe = Event {
        event_id: event.event_id,
        level: event.level,
        timestamp: event.timestamp,
        platform: event.platform,
        release: Some(RELEASE.into()),
        environment: Some(env!("ROUTEVN_SENTRY_ENVIRONMENT").into()),
        dist: Some(env!("ROUTEVN_SENTRY_DIST").into()),
        message: Some("Rust panic".to_owned()),
        exception: event.exception,
        stacktrace: event.stacktrace,
        // Only the valid device ID may survive as user.id; any other user
        // data on the incoming event is dropped.
        user: device_id.filter(|id| is_device_id(id)).map(|id| User {
            id: Some(id.to_owned()),
            ..User::default()
        }),
        ..Event::default()
    };

    for exception in &mut safe.exception.values {
        exception.ty = safe_identifier(&exception.ty).unwrap_or_else(|| "RustPanic".to_owned());
        exception.value = Some("Rust panic".to_owned());
        exception.module = None;
        exception.raw_stacktrace = None;
        exception.mechanism = exception.mechanism.take().map(|mechanism| Mechanism {
            ty: mechanism.ty,
            handled: mechanism.handled,
            ..Mechanism::default()
        });
        if let Some(stacktrace) = &mut exception.stacktrace {
            scrub_stacktrace(stacktrace);
        }
    }
    if let Some(stacktrace) = &mut safe.stacktrace {
        scrub_stacktrace(stacktrace);
    }
    let addresses: Vec<u64> = safe
        .exception
        .values
        .iter()
        .filter_map(|exception| exception.stacktrace.as_ref())
        .chain(safe.stacktrace.as_ref())
        .flat_map(|stacktrace| &stacktrace.frames)
        .filter_map(|frame| frame.instruction_addr.map(|address| address.0))
        .collect();
    safe.debug_meta = Cow::Owned(scrub_debug_meta(&event.debug_meta, &addresses));
    safe
}

fn send_event(event: Event<'static>) -> Option<Event<'static>> {
    (SENT_EVENTS.fetch_add(1, Ordering::Relaxed) < MAX_EVENTS_PER_SESSION)
        .then(|| scrub_event(event, DEVICE_ID.get().and_then(Option::as_deref)))
}

pub fn webview_init_script() -> String {
    let mut config = serde_json::json!({
        "dsn": env!("ROUTEVN_SENTRY_DSN"),
        "release": RELEASE,
        "environment": env!("ROUTEVN_SENTRY_ENVIRONMENT"),
        "dist": env!("ROUTEVN_SENTRY_DIST"),
    });
    if let Some(Some(device_id)) = DEVICE_ID.get() {
        config["deviceId"] = serde_json::json!(device_id);
    }
    // Tauri appends this to its IPC bootstrap without a separator.
    format!(
        ";\nObject.defineProperty(window, '__ROUTEVN_ERROR_REPORTING__', {{ value: Object.freeze({config}) }});\n"
    )
}

pub fn init() -> sentry::ClientInitGuard {
    // Read once before Sentry starts; an unavailable ID leaves user unset.
    let _ = DEVICE_ID.set(app_database_path().as_deref().and_then(read_device_id));
    // The transport uses rustls without a bundled provider; the updater installs
    // the same ring provider when it has not been set yet.
    let _ = rustls::crypto::ring::default_provider().install_default();
    let options = sentry::ClientOptions::new()
        .dsn(env!("ROUTEVN_SENTRY_DSN"))
        .release(RELEASE)
        .environment(env!("ROUTEVN_SENTRY_ENVIRONMENT"))
        .send_default_pii(false)
        .max_breadcrumbs(0)
        .default_integrations(false)
        .add_integration(PanicIntegration::new())
        .add_integration(ProcessStacktraceIntegration::new())
        // Attaches the loaded images' debug IDs, which match the kept dSYM, PDB
        // or debug file of the build that crashed.
        .add_integration(DebugImagesIntegration::new())
        .before_send(send_event)
        .shutdown_timeout(Duration::from_secs(2));

    sentry::init(options)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sentry::protocol::{Addr, Exception, User};
    use sentry::types::DebugId;

    #[test]
    fn removes_untrusted_panic_details() {
        let mut event = Event {
            level: sentry::Level::Fatal,
            message: Some("user@example.com token=secret".to_owned()),
            ..Event::default()
        };
        event.extra.insert("response".to_owned(), "secret".into());
        event
            .tags
            .insert("email".to_owned(), "user@example.com".to_owned());
        event.user = Some(User {
            email: Some("user@example.com".to_owned()),
            ..User::default()
        });
        let mut frame = Frame {
            filename: Some("/Users/user@example.com/main.rs?token=secret".to_owned()),
            function: Some("load_project".to_owned()),
            ..Frame::default()
        };
        frame.vars.insert("password".to_owned(), "secret".into());
        event.exception.values.push(Exception {
            ty: "Panic".to_owned(),
            value: Some("user@example.com token=secret".to_owned()),
            mechanism: Some(Mechanism {
                ty: "panic".to_owned(),
                handled: Some(false),
                description: Some("user@example.com token=secret".to_owned()),
                ..Mechanism::default()
            }),
            stacktrace: Some(Stacktrace {
                frames: vec![frame],
                ..Stacktrace::default()
            }),
            ..Exception::default()
        });

        let safe = scrub_event(event, None);
        assert_eq!(safe.level, sentry::Level::Fatal);
        let mechanism = safe.exception.values[0].mechanism.as_ref().unwrap();
        assert_eq!(mechanism.ty, "panic");
        assert_eq!(mechanism.handled, Some(false));
        let encoded = serde_json::to_string(&safe).unwrap();
        assert!(!encoded.contains("user@example.com"));
        assert!(!encoded.contains("token=secret"));
        assert!(!encoded.contains("response"));
        assert!(!encoded.contains("password"));
        assert!(encoded.contains("main.rs"));
        assert!(encoded.contains("Rust panic"));
    }

    #[test]
    fn keeps_only_the_images_sent_frames_point_into() {
        let image = |name: &str, start: u64, id: &str| {
            DebugImage::Symbolic(SymbolicDebugImage {
                name: name.to_owned(),
                arch: Some("arm64".to_owned()),
                image_addr: Addr(start),
                image_size: 0x1000,
                image_vmaddr: Addr(0),
                id: id.parse::<DebugId>().unwrap(),
                code_id: None,
                debug_file: Some(format!("{name}.pdb")),
            })
        };
        let mut event = Event {
            debug_meta: Cow::Owned(DebugMeta {
                images: vec![
                    image(
                        "/Users/user@example.com/RouteVN Creator.app/Contents/MacOS/RouteVN Creator",
                        0x10000,
                        "0f6b1c3e-2a4d-4c8b-9e7f-1a2b3c4d5e6f",
                    ),
                    image(
                        "/usr/lib/libunrelated.dylib",
                        0x90000,
                        "11111111-2222-4333-8444-555555555555",
                    ),
                ],
                ..DebugMeta::default()
            }),
            ..Event::default()
        };
        event.exception.values.push(Exception {
            ty: "Panic".to_owned(),
            stacktrace: Some(Stacktrace {
                frames: vec![Frame {
                    instruction_addr: Some(Addr(0x10400)),
                    ..Frame::default()
                }],
                ..Stacktrace::default()
            }),
            ..Exception::default()
        });

        let safe = scrub_event(event, None);
        let [DebugImage::Symbolic(kept)] = safe.debug_meta.images.as_slice() else {
            panic!("expected one symbolic image");
        };
        assert_eq!(kept.name, "RouteVN Creator");
        assert_eq!(kept.debug_file.as_deref(), Some("RouteVN Creator.pdb"));
        assert_eq!(kept.id.to_string(), "0f6b1c3e-2a4d-4c8b-9e7f-1a2b3c4d5e6f");
        let encoded = serde_json::to_string(&safe).unwrap();
        assert!(!encoded.contains("user@example.com"));
        assert!(!encoded.contains("libunrelated"));
    }

    #[test]
    fn matches_top_level_frames_within_the_image_range() {
        let event_at = |address: u64| {
            let event = Event {
                debug_meta: Cow::Owned(DebugMeta {
                    images: vec![DebugImage::Symbolic(SymbolicDebugImage {
                        name: "C:\\Users\\user\\RouteVN Creator.exe".to_owned(),
                        arch: None,
                        image_addr: Addr(0x10000),
                        image_size: 0x1000,
                        image_vmaddr: Addr(0),
                        id: "0f6b1c3e-2a4d-4c8b-9e7f-1a2b3c4d5e6f"
                            .parse::<DebugId>()
                            .unwrap(),
                        code_id: None,
                        debug_file: None,
                    })],
                    ..DebugMeta::default()
                }),
                stacktrace: Some(Stacktrace {
                    frames: vec![Frame {
                        instruction_addr: Some(Addr(address)),
                        ..Frame::default()
                    }],
                    ..Stacktrace::default()
                }),
                ..Event::default()
            };
            scrub_event(event, None)
        };

        // An image covers [image_addr, image_addr + image_size).
        for (address, kept) in [(0xffff, 0), (0x10000, 1), (0x10fff, 1), (0x11000, 0)] {
            assert_eq!(
                event_at(address).debug_meta.images.len(),
                kept,
                "{address:#x}"
            );
        }
        let safe = event_at(0x10000);
        let [DebugImage::Symbolic(image)] = safe.debug_meta.images.as_slice() else {
            panic!("expected one symbolic image");
        };
        assert_eq!(image.name, "RouteVN Creator.exe");
    }

    #[test]
    fn stops_sending_after_the_session_limit() {
        let sent: Vec<_> = (0..MAX_EVENTS_PER_SESSION + 2)
            .map(|_| send_event(Event::default()))
            .collect();
        assert!(sent[0].is_some());
        assert!(sent[MAX_EVENTS_PER_SESSION..].iter().all(Option::is_none));
    }

    #[test]
    fn keeps_only_the_device_id_as_user_id() {
        const DEVICE_ID: &str = "7mQkR2vXa9Lp8nRmS3wYb2Mq";
        let event = Event {
            user: Some(User {
                id: Some("someone-else".to_owned()),
                email: Some("user@example.com".to_owned()),
                username: Some("user".to_owned()),
                ip_address: Some("203.0.113.7".parse().unwrap()),
                other: [
                    ("segment".to_owned(), serde_json::json!("secret-segment")),
                    ("data".to_owned(), serde_json::json!({ "path": "secret" })),
                ]
                .into_iter()
                .collect(),
            }),
            ..Event::default()
        };

        let safe = scrub_event(event, Some(DEVICE_ID));
        let user = safe.user.as_ref().unwrap();
        assert_eq!(user.id.as_deref(), Some(DEVICE_ID));
        assert_eq!(user.email, None);
        assert_eq!(user.username, None);
        assert_eq!(user.ip_address, None);
        assert!(user.other.is_empty());
        let encoded = serde_json::to_string(&safe).unwrap();
        assert!(!encoded.contains("user@example.com"));
        assert!(!encoded.contains("someone-else"));
        assert!(!encoded.contains("secret-segment"));
    }

    #[test]
    fn drops_the_user_without_a_valid_device_id() {
        for device_id in [
            None,
            Some("not-a-device-id"),
            Some("0OQkR2vXa9Lp8nRmS3wYb2Mq"),
        ] {
            let event = Event {
                user: Some(User {
                    email: Some("user@example.com".to_owned()),
                    ..User::default()
                }),
                ..Event::default()
            };
            let safe = scrub_event(event, device_id);
            assert!(safe.user.is_none(), "{device_id:?}");
        }
    }

    fn create_database(file: &Path, value: Option<&str>, table: bool) {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            let options = SqliteConnectOptions::new()
                .filename(file)
                .create_if_missing(true);
            let mut connection = SqliteConnection::connect_with(&options).await.unwrap();
            if table {
                sqlx::query("CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT)")
                    .execute(&mut connection)
                    .await
                    .unwrap();
                if let Some(value) = value {
                    sqlx::query("INSERT INTO kv (key, value) VALUES ('deviceId', ?)")
                        .bind(value)
                        .execute(&mut connection)
                        .await
                        .unwrap();
                }
            }
        });
    }

    #[test]
    fn reads_only_valid_json_string_device_id() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("app.db");
        let valid = "7mQkR2vXa9Lp8nRmS3wYb2Mq";
        assert_eq!(read_device_id(&file), None);
        assert!(!file.exists());
        create_database(&file, None, false);
        assert_eq!(read_device_id(&file), None); // missing table
        std::fs::remove_file(&file).unwrap();
        create_database(&file, None, true);
        assert_eq!(read_device_id(&file), None); // missing row
        for value in [
            "not json",
            valid,
            "42",
            "null",
            "\"short\"",
            "\"0OQkR2vXa9Lp8nRmS3wYb2Mq\"",
        ] {
            sqlx_test_update(&file, value);
            assert_eq!(read_device_id(&file), None, "{value}");
        }
        sqlx_test_update(&file, &serde_json::to_string(valid).unwrap());
        assert_eq!(read_device_id(&file).as_deref(), Some(valid));
    }

    fn sqlx_test_update(file: &Path, value: &str) {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            let options = SqliteConnectOptions::new().filename(file);
            let mut connection = SqliteConnection::connect_with(&options).await.unwrap();
            sqlx::query("INSERT OR REPLACE INTO kv (key, value) VALUES ('deviceId', ?)")
                .bind(value)
                .execute(&mut connection)
                .await
                .unwrap();
        });
    }

    #[test]
    fn reads_a_device_id_still_in_the_write_ahead_log() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("app.db");
        let id = "7mQkR2vXa9Lp8nRmS3wYb2Mq";
        create_database(&file, None, true);
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        // Like the app, a WAL writer stays open, so the row is only in the log.
        let writer = runtime.block_on(async {
            let options = SqliteConnectOptions::new().filename(&file);
            let mut connection = SqliteConnection::connect_with(&options).await.unwrap();
            for sql in ["PRAGMA journal_mode=WAL", "PRAGMA wal_autocheckpoint=0"] {
                sqlx::query(sql).execute(&mut connection).await.unwrap();
            }
            sqlx::query("INSERT INTO kv (key, value) VALUES ('deviceId', ?)")
                .bind(serde_json::to_string(id).unwrap())
                .execute(&mut connection)
                .await
                .unwrap();
            connection
        });
        assert!(directory.path().join("app.db-wal").exists());
        assert_eq!(read_device_id(&file).as_deref(), Some(id));
        runtime.block_on(writer.close()).unwrap();
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn database_path_uses_config_directory() {
        assert_eq!(
            app_database_path(),
            dirs::config_dir().map(|base| base.join("com.routevn.creator/app.db"))
        );
        assert_ne!(
            app_database_path(),
            dirs::data_dir().map(|base| base.join("com.routevn.creator/app.db"))
        );
    }

    #[test]
    #[ignore = "requires the local API collector"]
    fn sends_one_panic_to_local_collector() {
        assert_eq!(env!("ROUTEVN_SENTRY_ENVIRONMENT"), "development");
        let _guard = init();
        assert!(
            std::panic::catch_unwind(|| {
                panic!("private@example.com token=should-not-store");
            })
            .is_err()
        );
    }
}
