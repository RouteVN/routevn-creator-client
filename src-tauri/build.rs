fn git_value(args: &[&str]) -> Option<String> {
    let output = std::process::Command::new("git").args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8(output.stdout).ok()?.trim().to_owned())
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
        println!("cargo:rerun-if-env-changed=ROUTEVN_SENTRY_DSN");
        let dsn = std::env::var("ROUTEVN_SENTRY_DSN").expect("ROUTEVN_SENTRY_DSN");
        assert!(!dsn.is_empty(), "ROUTEVN_SENTRY_DSN must not be empty");
        if !production {
            let url = url::Url::parse(&dsn).expect("Invalid development error collector DSN");
            assert!(
                url.scheme() == "http" && matches!(url.host_str(), Some("localhost" | "127.0.0.1")),
                "Development error reporting must use the local API"
            );
        }
        println!("cargo:rustc-env=ROUTEVN_SENTRY_DSN={dsn}");
        println!("cargo:rustc-env=ROUTEVN_SENTRY_ENVIRONMENT={environment}");
    }
    if let Some(path) = git_value(&["rev-parse", "--git-path", "HEAD"]) {
        println!("cargo:rerun-if-changed={path}");
    }
    if let Some(reference) = git_value(&["symbolic-ref", "-q", "HEAD"]) {
        if let Some(path) = git_value(&["rev-parse", "--git-path", &reference]) {
            println!("cargo:rerun-if-changed={path}");
        }
    }
    let build_id =
        git_value(&["rev-parse", "--short=12", "HEAD"]).unwrap_or_else(|| "local".to_owned());
    println!("cargo:rustc-env=ROUTEVN_BUILD_ID={build_id}");

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
