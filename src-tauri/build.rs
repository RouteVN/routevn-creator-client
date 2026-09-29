use sentry_types::{Dsn, Scheme};

fn git_value(args: &[&str]) -> Option<String> {
    let output = std::process::Command::new("git").args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8(output.stdout).ok()?.trim().to_owned())
}

fn release_build_id() -> String {
    // Builds without Git metadata, such as the Docker AppImage build, pass the
    // revision in explicitly.
    println!("cargo:rerun-if-env-changed=ROUTEVN_BUILD_ID");
    if let Some(build_id) = std::env::var("ROUTEVN_BUILD_ID")
        .ok()
        .filter(|build_id| !build_id.is_empty())
    {
        assert!(
            build_id.len() <= 64
                && build_id
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte)),
            "ROUTEVN_BUILD_ID must be at most 64 ASCII letters, digits, '.', '_' or '-'"
        );
        return build_id;
    }
    // Watch HEAD and its reflog instead of the branch ref file, which is removed
    // when refs are packed. Cargo reruns on every build if a watched file is missing.
    for name in ["HEAD", "logs/HEAD"] {
        if let Some(path) = git_value(&["rev-parse", "--git-path", name]) {
            if std::path::Path::new(&path).exists() {
                println!("cargo:rerun-if-changed={path}");
            }
        }
    }
    git_value(&["rev-parse", "--short=12", "HEAD"]).unwrap_or_else(|| "local".to_owned())
}

// `dist` names one shipped build. Symbols are uploaded per build, and each OS
// and distribution builds different binaries and bundles, so the build ID alone
// would give them all the same `dist`.
fn release_dist(build_id: &str, target_os: &str) -> String {
    println!("cargo:rerun-if-env-changed=VITE_ROUTEVN_DISTRIBUTION");
    let dist = match std::env::var("VITE_ROUTEVN_DISTRIBUTION").as_deref() {
        Ok("steam") => format!("{build_id}-{target_os}-steam"),
        _ => format!("{build_id}-{target_os}"),
    };
    // Sentry limits `dist` to 64 characters.
    assert!(
        dist.len() <= 64,
        "The error reporting dist {dist} is longer than 64 characters; shorten ROUTEVN_BUILD_ID"
    );
    dist
}

fn main() {
    if matches!(
        std::env::var("CARGO_CFG_TARGET_OS").as_deref(),
        Ok("windows" | "macos" | "linux")
    ) {
        let production =
            !tauri_build::is_dev() && std::env::var("PROFILE").as_deref() == Ok("release");
        let environment = if production {
            "production"
        } else {
            "development"
        };
        let dsn = if production {
            println!("cargo:rerun-if-changed=../.env.production");
            dotenvy::from_path_iter("../.env.production")
                .expect("Missing .env.production")
                .map(|entry| entry.expect("Invalid .env.production"))
                .find(|(key, _)| key == "ROUTEVN_SENTRY_DSN")
                .expect("ROUTEVN_SENTRY_DSN must be set in .env.production")
                .1
        } else {
            println!("cargo:rerun-if-env-changed=ROUTEVN_SENTRY_DSN");
            std::env::var("ROUTEVN_SENTRY_DSN").unwrap_or_else(|_| {
                "http://11111111111111111111111111111111@127.0.0.1:3000/system/sentry/1".to_owned()
            })
        };
        // The SDK panics at startup on a DSN it cannot parse, so reject it here.
        let parsed: Dsn = dsn.parse().expect("Invalid ROUTEVN_SENTRY_DSN");
        if production {
            assert!(
                parsed.scheme() == Scheme::Https,
                "Production error reporting must use an HTTPS DSN"
            );
        } else {
            // The webview CSP allows local connections only to 127.0.0.1.
            assert!(
                parsed.scheme() == Scheme::Http && parsed.host() == "127.0.0.1",
                "Development error reporting must use the local API on http://127.0.0.1"
            );
        }
        let dist = if production {
            let target_os = std::env::var("CARGO_CFG_TARGET_OS").expect("CARGO_CFG_TARGET_OS");
            release_dist(&release_build_id(), &target_os)
        } else {
            "local".to_owned()
        };
        println!("cargo:rustc-env=ROUTEVN_SENTRY_DSN={dsn}");
        println!("cargo:rustc-env=ROUTEVN_SENTRY_ENVIRONMENT={environment}");
        println!("cargo:rustc-env=ROUTEVN_SENTRY_DIST={dist}");
    }

    println!("cargo:rerun-if-changed=src/macos_fullscreen_escape.m");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new()
            .file("src/macos_fullscreen_escape.m")
            .flag("-fobjc-arc")
            .compile("macos_fullscreen_escape");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=WebKit");
    }
    tauri_build::build()
}
