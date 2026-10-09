use std::borrow::Cow;
use std::io::Write;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
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
use uuid::Uuid;

const RELEASE: &str = concat!("routevn-creator@", env!("CARGO_PKG_VERSION"));
// Matches the webview limit; the panic hook also blocks while each event is sent.
const MAX_EVENTS_PER_SESSION: usize = 10;
static SENT_EVENTS: AtomicUsize = AtomicUsize::new(0);

const CRASH_ID_FILENAME: &str = "crash-id";
// Set before sentry::init so every native event and the webview config carry it.
static CRASH_ID: OnceLock<String> = OnceLock::new();

// Random per-install crash ID: a lowercase UUID v4. Separate from the
// update-check device ID; sent only as the Sentry `user.id`.
fn is_crash_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 36
        && bytes[14] == b'4'
        && matches!(bytes[19], b'8'..=b'b')
        && bytes.iter().enumerate().all(|(index, &byte)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                byte == b'-'
            } else {
                byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)
            }
        })
}

// Resolve the app data directory before the Tauri builder runs, using the same
// base directories Tauri uses for AppData.
fn app_data_dir() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    let base = std::env::var_os("HOME")
        .map(|home| PathBuf::from(home).join("Library/Application Support"));
    #[cfg(target_os = "windows")]
    let base = std::env::var_os("APPDATA").map(PathBuf::from);
    #[cfg(target_os = "linux")]
    let base = linux_data_home(
        std::env::var_os("XDG_DATA_HOME").as_deref(),
        std::env::var_os("HOME").as_deref(),
    );
    base.map(|base| base.join("com.routevn.creator"))
}

#[cfg(any(target_os = "linux", test))]
fn linux_data_home(
    xdg_data_home: Option<&std::ffi::OsStr>,
    home: Option<&std::ffi::OsStr>,
) -> Option<PathBuf> {
    xdg_data_home
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .or_else(|| home.map(|home| PathBuf::from(home).join(".local/share")))
}

// Reuse the persisted ID, or create one and persist it. A missing or corrupt
// file gets a fresh ID; write failures keep an in-memory ID for this run.
// Diagnostics must never crash or block startup because of the ID.
fn crash_id_from_directory(data_dir: &Path) -> String {
    let file = data_dir.join(CRASH_ID_FILENAME);
    let stored = std::fs::read_to_string(&file);
    if let Ok(contents) = &stored
        && is_crash_id(contents.trim())
    {
        return contents.trim().to_owned();
    }
    let id = Uuid::new_v4().to_string();
    let persist = || -> std::io::Result<String> {
        std::fs::create_dir_all(data_dir)?;
        let mut temp = tempfile::NamedTempFile::new_in(data_dir)?;
        #[cfg(unix)]
        temp.as_file()
            .set_permissions(std::fs::Permissions::from_mode(0o600))?;
        temp.write_all(id.as_bytes())?;
        if stored.is_ok() {
            // An invalid existing file is replaced in one rename, never exposed
            // partially written to another process.
            temp.persist(&file)?;
            return Ok(id.clone());
        }
        match temp.persist_noclobber(&file) {
            Ok(_) => Ok(id.clone()),
            Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {
                let winner = std::fs::read_to_string(&file)?;
                if is_crash_id(winner.trim()) {
                    Ok(winner.trim().to_owned())
                } else {
                    error.file.persist(&file)?;
                    Ok(id.clone())
                }
            }
            Err(error) => Err(error.error),
        }
    };
    persist().unwrap_or(id)
}

fn load_or_create_crash_id() -> String {
    app_data_dir()
        .as_deref()
        .map(crash_id_from_directory)
        .unwrap_or_else(|| Uuid::new_v4().to_string())
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

fn scrub_event(event: Event<'static>, crash_id: Option<&str>) -> Event<'static> {
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
        // Only the install crash ID may survive as user.id; any other user
        // data on the incoming event is dropped.
        user: crash_id.filter(|id| is_crash_id(id)).map(|id| User {
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
        .then(|| scrub_event(event, CRASH_ID.get().map(String::as_str)))
}

pub fn webview_init_script() -> String {
    let config = serde_json::json!({
        "dsn": env!("ROUTEVN_SENTRY_DSN"),
        "release": RELEASE,
        "environment": env!("ROUTEVN_SENTRY_ENVIRONMENT"),
        "dist": env!("ROUTEVN_SENTRY_DIST"),
        "crashId": CRASH_ID.get(),
    });
    // Tauri appends this to its IPC bootstrap without a separator.
    format!(
        ";\nObject.defineProperty(window, '__ROUTEVN_ERROR_REPORTING__', {{ value: Object.freeze({config}) }});\n"
    )
}

pub fn init() -> sentry::ClientInitGuard {
    // Create and load the per-install crash ID before Sentry can send
    // anything; failures fall back to an in-memory ID for this run.
    let _ = CRASH_ID.set(load_or_create_crash_id());
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
    fn keeps_only_the_install_crash_id_as_user_id() {
        const CRASH_ID: &str = "0f6b1c3e-2a4d-4c8b-9e7f-1a2b3c4d5e6f";
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

        let safe = scrub_event(event, Some(CRASH_ID));
        let user = safe.user.as_ref().unwrap();
        assert_eq!(user.id.as_deref(), Some(CRASH_ID));
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
    fn drops_the_user_without_a_valid_crash_id() {
        for crash_id in [
            None,
            Some("not-a-uuid"),
            Some("0F6B1C3E-2A4D-4C8B-9E7F-1A2B3C4D5E6F"),
        ] {
            let event = Event {
                user: Some(User {
                    email: Some("user@example.com".to_owned()),
                    ..User::default()
                }),
                ..Event::default()
            };
            let safe = scrub_event(event, crash_id);
            assert!(safe.user.is_none(), "{crash_id:?}");
        }
    }

    #[test]
    fn creates_and_reuses_the_persisted_crash_id() {
        let data_dir = tempfile::tempdir().unwrap();
        let first = crash_id_from_directory(data_dir.path());
        assert!(is_crash_id(&first));
        assert_eq!(
            std::fs::read_to_string(data_dir.path().join(CRASH_ID_FILENAME)).unwrap(),
            first
        );
        let second = crash_id_from_directory(data_dir.path());
        assert_eq!(first, second);
    }

    #[cfg(unix)]
    #[test]
    fn creates_crash_id_with_owner_only_permissions() {
        let data_dir = tempfile::tempdir().unwrap();
        crash_id_from_directory(data_dir.path());
        let mode = std::fs::metadata(data_dir.path().join(CRASH_ID_FILENAME))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);
    }

    #[test]
    fn ignores_empty_and_relative_xdg_data_home() {
        use std::ffi::OsStr;

        let home = Some(OsStr::new("/home/tester"));
        let fallback = Some(PathBuf::from("/home/tester/.local/share"));
        assert_eq!(linux_data_home(Some(OsStr::new("")), home), fallback);
        assert_eq!(
            linux_data_home(Some(OsStr::new("relative/path")), home),
            fallback
        );
        assert_eq!(
            linux_data_home(Some(OsStr::new("/custom/data")), home),
            Some(PathBuf::from("/custom/data"))
        );
    }

    #[test]
    fn regenerates_a_corrupt_crash_id_file() {
        let data_dir = tempfile::tempdir().unwrap();
        let file = data_dir.path().join(CRASH_ID_FILENAME);
        for corrupt in [
            "not-a-uuid",
            "",
            "0f6b1c3e-2a4d-4c8b-9e7f-1a2b3c4d5e6f\nextra",
        ] {
            std::fs::write(&file, corrupt).unwrap();
            let regenerated = crash_id_from_directory(data_dir.path());
            assert!(is_crash_id(&regenerated), "{corrupt:?}");
            assert_ne!(regenerated, corrupt.trim());
            assert_eq!(
                std::fs::read_to_string(&file).unwrap(),
                regenerated,
                "the fresh ID must be persisted"
            );
        }
        // A valid stored ID survives, including with surrounding whitespace.
        std::fs::write(&file, "0f6b1c3e-2a4d-4c8b-9e7f-1a2b3c4d5e6f\n").unwrap();
        let original = std::fs::read_to_string(&file).unwrap();
        assert_eq!(
            crash_id_from_directory(data_dir.path()),
            "0f6b1c3e-2a4d-4c8b-9e7f-1a2b3c4d5e6f"
        );
        assert_eq!(std::fs::read_to_string(&file).unwrap(), original);
    }

    #[test]
    fn falls_back_to_an_in_memory_id_when_storage_is_unwritable() {
        let data_dir = tempfile::tempdir().unwrap();
        // A directory in the file's place makes both read and write fail.
        std::fs::create_dir(data_dir.path().join(CRASH_ID_FILENAME)).unwrap();
        let id = crash_id_from_directory(data_dir.path());
        assert!(is_crash_id(&id));
        assert_ne!(id, crash_id_from_directory(data_dir.path()));
    }

    #[cfg(unix)]
    #[test]
    fn falls_back_when_the_data_directory_is_read_only() {
        let data_dir = tempfile::tempdir().unwrap();
        std::fs::set_permissions(data_dir.path(), std::fs::Permissions::from_mode(0o500)).unwrap();
        let first = crash_id_from_directory(data_dir.path());
        let second = crash_id_from_directory(data_dir.path());
        std::fs::set_permissions(data_dir.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
        assert!(is_crash_id(&first));
        assert_ne!(first, second);
        assert!(!data_dir.path().join(CRASH_ID_FILENAME).exists());
    }

    #[test]
    fn creates_missing_app_data_directories() {
        let data_dir = tempfile::tempdir().unwrap();
        let nested = data_dir.path().join("missing/inner");
        let id = crash_id_from_directory(&nested);
        assert!(is_crash_id(&id));
        assert!(nested.join(CRASH_ID_FILENAME).is_file());
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
