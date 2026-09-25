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
        println!("cargo:rerun-if-env-changed=ROUTEVN_SENTRY_DEVELOPMENT_DSN");
        let production =
            !tauri_build::is_dev() && std::env::var("PROFILE").as_deref() == Ok("release");
        let environment = if production {
            "production"
        } else {
            "development"
        };
        let dsn = if production {
            "https://4a1f0f2f77f130fd8366487119b90a7d@api1.routevn.com/system/sentry/1".to_owned()
        } else {
            let dsn = std::env::var("ROUTEVN_SENTRY_DEVELOPMENT_DSN").unwrap_or_else(|_| {
                "http://11111111111111111111111111111111@127.0.0.1:3000/system/sentry/1".to_owned()
            });
            let url = url::Url::parse(&dsn).expect("Invalid development error collector DSN");
            assert!(
                url.scheme() == "http" && matches!(url.host_str(), Some("localhost" | "127.0.0.1")),
                "Development error reporting must use the local API"
            );
            dsn
        };
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
