use std::borrow::Cow;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use sentry::integrations::backtrace::ProcessStacktraceIntegration;
use sentry::integrations::debug_images::DebugImagesIntegration;
use sentry::integrations::panic::PanicIntegration;
use sentry::protocol::{DebugImage, DebugMeta, Event, Frame, Mechanism, Stacktrace};

const RELEASE: &str = concat!("routevn-creator@", env!("CARGO_PKG_VERSION"));
// Matches the webview limit; the panic hook also blocks while each event is sent.
const MAX_EVENTS_PER_SESSION: usize = 10;
static SENT_EVENTS: AtomicUsize = AtomicUsize::new(0);

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

fn frame_addresses(stacktrace: Option<&Stacktrace>) -> Vec<u64> {
    stacktrace
        .map(|trace| {
            trace
                .frames
                .iter()
                .filter_map(|frame| frame.instruction_addr.map(|address| address.0))
                .collect()
        })
        .unwrap_or_default()
}

fn scrub_image(image: &DebugImage, addresses: &[u64]) -> Option<DebugImage> {
    let (start, size) = match image {
        DebugImage::Apple(value) => (value.image_addr.0, value.image_size),
        DebugImage::Symbolic(value) => (value.image_addr.0, value.image_size),
        _ => return None,
    };
    if !addresses
        .iter()
        .any(|address| *address >= start && *address - start < size)
    {
        return None;
    }
    match image {
        DebugImage::Apple(value) => {
            let mut safe = value.clone();
            safe.name = safe_filename(&value.name)?;
            safe.cpu_type = None;
            safe.cpu_subtype = None;
            Some(DebugImage::Apple(safe))
        }
        DebugImage::Symbolic(value) => {
            let mut safe = value.clone();
            safe.name = safe_filename(&value.name)?;
            safe.debug_file = value.debug_file.as_deref().and_then(safe_filename);
            Some(DebugImage::Symbolic(safe))
        }
        _ => None,
    }
}

fn scrub_event(event: Event<'static>) -> Event<'static> {
    let mut addresses = frame_addresses(event.stacktrace.as_ref());
    for exception in &event.exception.values {
        addresses.extend(frame_addresses(exception.stacktrace.as_ref()));
    }
    let images = event
        .debug_meta
        .images
        .iter()
        .filter_map(|image| scrub_image(image, &addresses))
        .collect();
    let mut safe = Event {
        event_id: event.event_id,
        level: event.level,
        timestamp: event.timestamp,
        platform: "native".into(),
        release: Some(RELEASE.into()),
        environment: Some(env!("ROUTEVN_SENTRY_ENVIRONMENT").into()),
        dist: Some(env!("ROUTEVN_BUILD_ID").into()),
        message: Some("Rust panic".to_owned()),
        exception: event.exception,
        stacktrace: event.stacktrace,
        debug_meta: Cow::Owned(DebugMeta {
            images,
            sdk_info: None,
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
    safe
}

fn send_event(event: Event<'static>) -> Option<Event<'static>> {
    (SENT_EVENTS.fetch_add(1, Ordering::Relaxed) < MAX_EVENTS_PER_SESSION)
        .then(|| scrub_event(event))
}

pub fn webview_init_script() -> String {
    let config = serde_json::json!({
        "dsn": env!("ROUTEVN_SENTRY_DSN"),
        "release": RELEASE,
        "environment": env!("ROUTEVN_SENTRY_ENVIRONMENT"),
        "dist": env!("ROUTEVN_BUILD_ID"),
    });
    // Tauri appends this to its IPC bootstrap without a separator.
    format!(
        ";\nObject.defineProperty(window, '__ROUTEVN_ERROR_REPORTING__', {{ value: Object.freeze({config}) }});\n"
    )
}

pub fn init() -> sentry::ClientInitGuard {
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
        .add_integration(DebugImagesIntegration::new())
        .before_send(send_event)
        .shutdown_timeout(Duration::from_secs(2));

    sentry::init(options)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sentry::protocol::{Exception, SymbolicDebugImage, User};

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

        let safe = scrub_event(event);
        assert_eq!(safe.level, sentry::Level::Fatal);
        assert_eq!(safe.platform.as_ref(), "native");
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
    fn stops_sending_after_the_session_limit() {
        let sent: Vec<_> = (0..MAX_EVENTS_PER_SESSION + 2)
            .map(|_| send_event(Event::default()))
            .collect();
        assert!(sent[0].is_some());
        assert!(sent[MAX_EVENTS_PER_SESSION..].iter().all(Option::is_none));
    }

    #[test]
    fn keeps_only_images_containing_a_retained_instruction_address() {
        let image = |start: u64, name: &str| {
            DebugImage::Symbolic(SymbolicDebugImage {
                name: name.to_owned(),
                arch: Some("arm64".to_owned()),
                image_addr: start.into(),
                image_size: 0x100,
                image_vmaddr: 0x4000u64.into(),
                id: "12345678-1234-1234-1234-123456789abc".parse().unwrap(),
                code_id: None,
                debug_file: Some("/Users/private/app.debug".to_owned()),
            })
        };
        let event = Event {
            stacktrace: Some(Stacktrace {
                frames: vec![Frame {
                    instruction_addr: Some(0x1080u64.into()),
                    ..Frame::default()
                }],
                ..Stacktrace::default()
            }),
            debug_meta: Cow::Owned(DebugMeta {
                images: vec![
                    image(0x1000u64, "/Users/private/app"),
                    image(0x2000u64, "/Users/private/unrelated"),
                ],
                ..DebugMeta::default()
            }),
            ..Event::default()
        };
        let safe = scrub_event(event);
        assert_eq!(safe.debug_meta.images.len(), 1);
        let DebugImage::Symbolic(image) = &safe.debug_meta.images[0] else {
            panic!("expected symbolic image");
        };
        assert_eq!(image.name, "app");
        assert_eq!(image.debug_file.as_deref(), Some("app.debug"));
        assert_eq!(image.image_addr.0, 0x1000);
        assert_eq!(image.image_size, 0x100);
        assert_eq!(image.image_vmaddr.0, 0x4000);
        assert_eq!(image.id.to_string(), "12345678-1234-1234-1234-123456789abc");
    }

    #[test]
    fn keeps_images_for_exception_frames_and_drops_all_without_frames() {
        let image = |start: u64| {
            DebugImage::Symbolic(SymbolicDebugImage {
                name: "app".to_owned(),
                arch: None,
                image_addr: start.into(),
                image_size: 0x100,
                image_vmaddr: 0.into(),
                id: "12345678-1234-1234-1234-123456789abc".parse().unwrap(),
                code_id: None,
                debug_file: None,
            })
        };
        let meta = || {
            Cow::Owned(DebugMeta {
                images: vec![image(0x1000), image(0x2000)],
                ..DebugMeta::default()
            })
        };
        let exception = Exception {
            ty: "panic".to_owned(),
            stacktrace: Some(Stacktrace {
                frames: vec![Frame {
                    instruction_addr: Some(0x20ffu64.into()),
                    ..Frame::default()
                }],
                ..Stacktrace::default()
            }),
            ..Exception::default()
        };
        let with_frame = Event {
            exception: vec![exception].into(),
            debug_meta: meta(),
            ..Event::default()
        };
        let safe = scrub_event(with_frame);
        assert_eq!(safe.debug_meta.images.len(), 1);
        let DebugImage::Symbolic(kept) = &safe.debug_meta.images[0] else {
            panic!("expected symbolic image");
        };
        assert_eq!(kept.image_addr.0, 0x2000);

        // The address one past the image end does not belong to it.
        let boundary = Event {
            stacktrace: Some(Stacktrace {
                frames: vec![Frame {
                    instruction_addr: Some(0x1100u64.into()),
                    ..Frame::default()
                }],
                ..Stacktrace::default()
            }),
            debug_meta: meta(),
            ..Event::default()
        };
        assert!(scrub_event(boundary).debug_meta.images.is_empty());

        let without_frames = Event {
            debug_meta: meta(),
            ..Event::default()
        };
        assert!(scrub_event(without_frames).debug_meta.images.is_empty());
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
