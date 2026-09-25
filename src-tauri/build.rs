fn git_value(args: &[&str]) -> Option<String> {
    let output = std::process::Command::new("git").args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8(output.stdout).ok()?.trim().to_owned())
}

fn main() {
    println!("cargo:rerun-if-env-changed=ROUTEVN_SENTRY_PRODUCTION_DSN");
    println!("cargo:rerun-if-env-changed=ROUTEVN_SENTRY_DEVELOPMENT_DSN");
    println!("cargo:rerun-if-env-changed=ROUTEVN_SENTRY_BUILD_ENV");

    let desktop = matches!(
        std::env::var("CARGO_CFG_TARGET_OS").as_deref(),
        Ok("windows" | "macos" | "linux")
    );
    let release_profile = std::env::var("PROFILE").as_deref() == Ok("release");
    let build_environment = std::env::var("ROUTEVN_SENTRY_BUILD_ENV");
    if desktop && release_profile && build_environment.is_err() {
        panic!("Set ROUTEVN_SENTRY_BUILD_ENV when building a desktop release.");
    }
    let production = build_environment.as_deref() == Ok("production");
    if desktop && production && !release_profile {
        panic!("A desktop development build cannot use the production error collector.");
    }
    if desktop
        && !production
        && build_environment
            .as_deref()
            .is_ok_and(|value| value != "development")
    {
        panic!("Invalid desktop error collector environment.");
    }
    let dsn_variable = if production {
        "ROUTEVN_SENTRY_PRODUCTION_DSN"
    } else {
        "ROUTEVN_SENTRY_DEVELOPMENT_DSN"
    };
    let dsn = std::env::var(dsn_variable).unwrap_or_else(|_| {
        if production {
            "https://4a1f0f2f77f130fd8366487119b90a7d@api1.routevn.com/system/sentry/1".to_owned()
        } else {
            "http://11111111111111111111111111111111@127.0.0.1:3000/system/sentry/1".to_owned()
        }
    });
    if desktop {
        let url = url::Url::parse(&dsn).expect("Invalid desktop error collector DSN");
        let valid_host = if production {
            url.scheme() == "https" && url.host_str() == Some("api1.routevn.com")
        } else {
            url.scheme() == "http" && matches!(url.host_str(), Some("localhost" | "127.0.0.1"))
        };
        let valid_key = if production {
            url.username().len() == 32
                && url.username().bytes().all(|byte| byte.is_ascii_hexdigit())
        } else {
            url.username() == "11111111111111111111111111111111"
        };
        assert!(
            valid_host
                && valid_key
                && url.password().is_none()
                && url.path() == "/system/sentry/1"
                && url.query().is_none()
                && url.fragment().is_none(),
            "Invalid desktop error collector DSN for this build"
        );
        println!("cargo:rustc-env=ROUTEVN_SENTRY_DSN={dsn}");
    }
    println!(
        "cargo:rustc-env=ROUTEVN_SENTRY_ENVIRONMENT={}",
        if production {
            "production"
        } else {
            "development"
        }
    );
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
