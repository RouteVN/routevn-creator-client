use std::time::Duration;

use sentry::integrations::panic::PanicIntegration;
use sentry::protocol::{Event, Frame, Stacktrace};

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
            ..Frame::default()
        };
    }
}

fn scrub_event(event: Event<'static>) -> Event<'static> {
    let mut safe = Event {
        event_id: event.event_id,
        level: sentry::Level::Error,
        timestamp: event.timestamp,
        platform: "rust".into(),
        release: Some(format!("routevn-creator@{}", env!("CARGO_PKG_VERSION")).into()),
        environment: Some(env!("ROUTEVN_SENTRY_ENVIRONMENT").into()),
        dist: Some(env!("ROUTEVN_BUILD_ID").into()),
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
        exception.mechanism = None;
        if let Some(stacktrace) = &mut exception.stacktrace {
            scrub_stacktrace(stacktrace);
        }
    }
    if let Some(stacktrace) = &mut safe.stacktrace {
        scrub_stacktrace(stacktrace);
    }
    safe
}

pub fn webview_init_script() -> String {
    let config = serde_json::json!({
        "dsn": env!("ROUTEVN_SENTRY_DSN"),
        "release": format!("routevn-creator@{}", env!("CARGO_PKG_VERSION")),
        "environment": env!("ROUTEVN_SENTRY_ENVIRONMENT"),
        "dist": env!("ROUTEVN_BUILD_ID"),
    });
    format!(
        "Object.defineProperty(window, '__ROUTEVN_ERROR_REPORTING__', {{ value: Object.freeze({config}) }});"
    )
}

pub fn init() -> sentry::ClientInitGuard {
    let options = sentry::ClientOptions::new()
        .dsn(env!("ROUTEVN_SENTRY_DSN"))
        .release(format!("routevn-creator@{}", env!("CARGO_PKG_VERSION")))
        .environment(env!("ROUTEVN_SENTRY_ENVIRONMENT"))
        .send_default_pii(false)
        .max_breadcrumbs(25)
        .traces_sample_rate(0.0)
        .default_integrations(false)
        .add_integration(PanicIntegration::new())
        .before_breadcrumb(|_| None)
        .before_send(|event| Some(scrub_event(event)))
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
            stacktrace: Some(Stacktrace {
                frames: vec![frame],
                ..Stacktrace::default()
            }),
            ..Exception::default()
        });

        let safe = scrub_event(event);
        let encoded = serde_json::to_string(&safe).unwrap();
        assert!(!encoded.contains("user@example.com"));
        assert!(!encoded.contains("token=secret"));
        assert!(!encoded.contains("response"));
        assert!(!encoded.contains("password"));
        assert!(encoded.contains("main.rs"));
        assert!(encoded.contains("Rust panic"));
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
