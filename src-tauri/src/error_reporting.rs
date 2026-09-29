use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use sentry::integrations::backtrace::ProcessStacktraceIntegration;
use sentry::integrations::panic::PanicIntegration;
use sentry::protocol::{Event, Frame, Mechanism, Stacktrace};

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

fn scrub_event(event: Event<'static>) -> Event<'static> {
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
        "dist": env!("ROUTEVN_SENTRY_DIST"),
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
        .before_send(send_event)
        .shutdown_timeout(Duration::from_secs(2));

    sentry::init(options)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sentry::protocol::{Exception, User};

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
