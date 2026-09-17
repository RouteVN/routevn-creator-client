fn main() {
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
