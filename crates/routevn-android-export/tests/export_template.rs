//! Exports a small game with the committed player template and checks the
//! result. Set ROUTEVN_ANDROID_EXPORT_KEEP to a path to keep the APK for manual
//! inspection with the Android build tools.

use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use image::{Rgba, RgbaImage};
use routevn_android_export::arsc::ResourceTable;
use routevn_android_export::axml::{self, BinaryXml};
use routevn_android_export::template::{self, PACKAGE_ASSET_ENTRY};
use routevn_android_export::{
    AndroidExportRequest, ErrorCode, Orientation, export_android_apk, host_capabilities, zip,
};
use routevn_exporter::{ZipAssetInput, ZipExportProgress};
use routevn_packager::payload::StandaloneChunkedPayloadReader;

fn template_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../src-tauri/assets/player-templates/android")
}

fn request(work: &Path, template: &Path, descriptor: &Path) -> AndroidExportRequest {
    let icon_path = work.join("icon.png");
    let mut icon = RgbaImage::from_pixel(600, 400, Rgba([220, 60, 30, 255]));
    for x in 0..600 {
        icon.put_pixel(x, 200, Rgba([255, 255, 255, 255]));
    }
    icon.save(&icon_path).unwrap();

    let asset_path = work.join("asset.bin");
    std::fs::write(&asset_path, vec![0x5a; 3 * 1024 * 1024 + 17]).unwrap();

    AndroidExportRequest {
        template_path: template.to_path_buf(),
        descriptor_path: descriptor.to_path_buf(),
        output_path: work.join("Game One-1.2.3-unsigned.apk"),
        assets: vec![ZipAssetInput {
            id: "asset-1".to_string(),
            path: asset_path.display().to_string(),
            mime: Some("application/octet-stream".to_string()),
        }],
        instructions_json: r#"{"projectData":{"screen":{"width":1080,"height":1920},"story":{"initialSceneId":"scene-1","scenes":{"scene-1":{"initialSectionId":"section-1","sections":{"section-1":{"lines":[]}}}}}}}"#.to_string(),
        application_id: "com.example.game_one".to_string(),
        application_name: "Game One ゲーム".to_string(),
        version_name: "1.2.3".to_string(),
        version_code: 42,
        orientation: Orientation::Portrait,
        icon_path,
        adaptive_icon_path: None,
        splash_icon_path: None,
        icon_background_color: "#12AB34".to_string(),
        splash_background_color: "#000000".to_string(),
        work_dir: Some(work.to_path_buf()),
    }
}

#[test]
fn exports_a_customized_unsigned_apk() {
    let dir = template_dir();
    let template_path = dir.join("RouteVNPlayerTemplate.apk");
    let descriptor_path = dir.join("RouteVNPlayerTemplate.json");
    if !template_path.is_file() {
        eprintln!(
            "Skipping: no Android player template at {}",
            template_path.display()
        );
        return;
    }
    assert!(host_capabilities(&template_path, &descriptor_path).available);

    let work = tempfile::tempdir().unwrap();
    let request = request(work.path(), &template_path, &descriptor_path);
    let phases = Mutex::new(Vec::<String>::new());
    let on_progress = |progress: ZipExportProgress| {
        let mut phases = phases.lock().unwrap();
        if phases.last() != Some(&progress.phase) {
            phases.push(progress.phase);
        }
    };
    let result = export_android_apk(&request, Some(&on_progress)).unwrap();
    let phases = phases.into_inner().unwrap();
    for phase in [
        "prepareApk",
        "encryptPayload",
        "rewriteManifest",
        "renderIcons",
        "writeApk",
        "verifyApk",
        "finalizeApk",
    ] {
        assert!(
            phases.iter().any(|seen| seen == phase),
            "missing phase {phase} in {phases:?}"
        );
    }

    let apk = &request.output_path;
    assert_eq!(result.apk_bytes, std::fs::metadata(apk).unwrap().len());
    let leftovers: Vec<_> = std::fs::read_dir(work.path())
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().to_string())
        .filter(|name| name.starts_with(".routevn-apk-") || name.starts_with("routevn-apk-"))
        .collect();
    assert!(
        leftovers.is_empty(),
        "intermediate files left behind: {leftovers:?}"
    );

    let mut file = File::open(apk).unwrap();
    let index = zip::read_index(&mut file).unwrap();
    template::check_alignment(&index).unwrap();
    assert!(!index.has_apk_signing_block);

    let manifest = BinaryXml::parse(
        &zip::read_entry(&mut file, index.entry("AndroidManifest.xml").unwrap()).unwrap(),
    )
    .unwrap();
    let facts = template::manifest_facts(&manifest).unwrap();
    assert_eq!(facts.package, "com.example.game_one");
    assert_eq!(facts.version_code, 42);
    assert_eq!(facts.version_name, "1.2.3");
    assert_eq!(facts.label, "Game One ゲーム");
    assert_eq!(facts.orientation, axml::SCREEN_ORIENTATION_SENSOR_PORTRAIT);

    let table = ResourceTable::parse(
        &zip::read_entry(&mut file, index.entry("resources.arsc").unwrap()).unwrap(),
    )
    .unwrap();
    assert!(table.color_offsets(0xFF13_579B).is_empty());
    assert!(table.color_offsets(0xFF24_68AC).is_empty());
    assert!(!table.color_offsets(0xFF12_AB34).is_empty());
    assert!(!table.color_offsets(0xFF00_0000).is_empty());

    let package = index.entry(PACKAGE_ASSET_ENTRY).unwrap();
    let mut reader = StandaloneChunkedPayloadReader::open_range(
        apk,
        package.data_offset,
        package.compressed_size,
    )
    .unwrap();
    assert_eq!(reader.plaintext_len(), result.package_bin_bytes);
    let mut head = [0u8; 16];
    assert_eq!(reader.read_at(0, &mut head).unwrap(), 16);

    if let Ok(keep) = std::env::var("ROUTEVN_ANDROID_EXPORT_KEEP") {
        std::fs::copy(apk, keep).unwrap();
    }
}

#[test]
fn rejects_invalid_requests_before_writing() {
    let dir = template_dir();
    let work = tempfile::tempdir().unwrap();
    let mut request = request(
        work.path(),
        &dir.join("RouteVNPlayerTemplate.apk"),
        &dir.join("RouteVNPlayerTemplate.json"),
    );
    request.application_id = "com.example-game".to_string();
    let error = export_android_apk(&request, None).unwrap_err();
    assert_eq!(error.code, ErrorCode::InvalidRequest);
    assert!(!request.output_path.exists());

    request.application_id = "com.example.game".to_string();
    request.version_code = 0;
    assert_eq!(
        export_android_apk(&request, None).unwrap_err().code,
        ErrorCode::InvalidRequest
    );

    request.version_code = 1;
    request.splash_background_color = "#00000080".to_string();
    assert_eq!(
        export_android_apk(&request, None).unwrap_err().code,
        ErrorCode::InvalidRequest
    );
}

#[test]
fn exports_distinct_optional_icons() {
    use routevn_android_export::icons::ImageKind;
    let dir = template_dir();
    let template_path = dir.join("RouteVNPlayerTemplate.apk");
    let descriptor_path = dir.join("RouteVNPlayerTemplate.json");
    if !template_path.is_file() {
        return;
    }
    let work = tempfile::tempdir().unwrap();
    let mut request = request(work.path(), &template_path, &descriptor_path);
    for (name, color) in [
        ("app", [220, 60, 30, 255]),
        ("adaptive", [10, 200, 30, 255]),
        ("splash", [10, 30, 220, 255]),
    ] {
        RgbaImage::from_pixel(32, 32, Rgba(color))
            .save(work.path().join(format!("{name}.png")))
            .unwrap();
    }
    request.icon_path = work.path().join("app.png");
    request.adaptive_icon_path = Some(work.path().join("adaptive.png"));
    request.splash_icon_path = Some(work.path().join("splash.png"));
    export_android_apk(&request, None).unwrap();
    let descriptor = template::load_descriptor(&template_path, &descriptor_path).unwrap();
    let mut file = File::open(&request.output_path).unwrap();
    let index = zip::read_index(&mut file).unwrap();
    for slot in descriptor.images {
        let bytes = zip::read_entry(&mut file, index.entry(&slot.entry).unwrap()).unwrap();
        let image = image::load_from_memory(&bytes).unwrap().to_rgba8();
        assert_eq!(image.dimensions(), (slot.size, slot.size));
        let color = match slot.kind {
            ImageKind::Legacy => [220, 60, 30, 255],
            ImageKind::AdaptiveForeground => [10, 200, 30, 255],
            ImageKind::Splash => [10, 30, 220, 255],
        };
        assert_eq!(
            image.get_pixel(slot.size / 2, slot.size / 2).0,
            color,
            "{}",
            slot.entry
        );
    }
}
