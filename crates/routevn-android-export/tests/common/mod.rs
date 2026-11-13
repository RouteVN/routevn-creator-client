//! The game and template paths the export tests share.

use std::path::{Path, PathBuf};

use image::{Rgba, RgbaImage};
use routevn_android_export::{AndroidExportRequest, Orientation};
use routevn_exporter::ZipAssetInput;

pub fn template_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../src-tauri/assets/player-templates/android")
}

pub fn request(work: &Path, template: &Path, descriptor: &Path) -> AndroidExportRequest {
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
