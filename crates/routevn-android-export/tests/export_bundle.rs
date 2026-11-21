//! Exports a small game as an app bundle with the committed template and
//! checks the result. Set ROUTEVN_ANDROID_BUNDLE_KEEP to a path to keep the
//! bundle, with its key as `<path>.p12` (password `android`, alias `upload`),
//! for bundletool and jarsigner.

mod common;

use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};

use common::{request, template_dir};
use routevn_android_export::bundle::{
    self, BUNDLE_MANIFEST_ENTRY, BUNDLE_PACKAGE_ASSET_ENTRY, BUNDLE_RESOURCES_ENTRY,
};
use routevn_android_export::proto_resources::ResourceTable;
use routevn_android_export::proto_xml::{self, ProtoXml};
use routevn_android_export::{
    AndroidExportRequest, ErrorCode, SigningKey, axml, export_android_app_bundle, jar, zip,
};
use routevn_exporter::ZipExportProgress;
use routevn_packager::payload::StandaloneChunkedPayloadReader;

static KEY: LazyLock<SigningKey> =
    LazyLock::new(|| SigningKey::generate("Game One", "com.example.game_one").unwrap());

fn template_paths() -> Option<(PathBuf, PathBuf)> {
    let dir = template_dir();
    let template = dir.join("RouteVNPlayerTemplate.aab");
    if !template.is_file() {
        eprintln!(
            "Skipping: no Android player template bundle at {}",
            template.display()
        );
        return None;
    }
    Some((template, dir.join("RouteVNPlayerTemplate.aab.json")))
}

fn bundle_request(work: &Path, template: &Path, descriptor: &Path) -> AndroidExportRequest {
    let mut request = request(work, template, descriptor);
    request.output_path = work.join("Game One-1.2.3.aab");
    request
}

#[test]
fn template_protocol_buffers_round_trip_unchanged() {
    let Some((template, _)) = template_paths() else {
        return;
    };
    let mut file = File::open(&template).unwrap();
    let index = zip::read_index(&mut file).unwrap();
    let manifest = zip::read_entry(&mut file, index.entry(BUNDLE_MANIFEST_ENTRY).unwrap()).unwrap();
    assert_eq!(ProtoXml::parse(&manifest).unwrap().encode(), manifest);
    let resources =
        zip::read_entry(&mut file, index.entry(BUNDLE_RESOURCES_ENTRY).unwrap()).unwrap();
    assert_eq!(
        ResourceTable::parse(&resources).unwrap().encode(),
        resources
    );
}

#[test]
fn exports_a_customized_signed_bundle() {
    let Some((template, descriptor)) = template_paths() else {
        return;
    };
    let work = tempfile::tempdir().unwrap();
    let request = bundle_request(work.path(), &template, &descriptor);
    let phases = Mutex::new(Vec::<String>::new());
    let on_progress = |progress: ZipExportProgress| {
        let mut phases = phases.lock().unwrap();
        if phases.last() != Some(&progress.phase) {
            phases.push(progress.phase);
        }
    };
    let result = export_android_app_bundle(&request, &KEY, Some(&on_progress)).unwrap();
    let phases = phases.into_inner().unwrap();
    for phase in [
        "prepareBundle",
        "encryptPayload",
        "rewriteManifest",
        "renderIcons",
        "signBundle",
        "writeBundle",
        "verifyBundle",
        "finalizeBundle",
    ] {
        assert!(
            phases.iter().any(|seen| seen == phase),
            "missing phase {phase} in {phases:?}"
        );
    }

    let path = &request.output_path;
    assert_eq!(result.bundle_bytes, std::fs::metadata(path).unwrap().len());
    assert_eq!(
        result.signing_certificate_sha256,
        KEY.certificate_sha256_hex()
    );
    let leftovers: Vec<_> = std::fs::read_dir(work.path())
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().to_string())
        .filter(|name| name.starts_with(".routevn-aab-") || name.starts_with("routevn-aab-"))
        .collect();
    assert!(
        leftovers.is_empty(),
        "intermediate files left behind: {leftovers:?}"
    );

    let mut file = File::open(path).unwrap();
    let index = zip::read_index(&mut file).unwrap();
    let names: Vec<&str> = index
        .entries
        .iter()
        .map(|entry| entry.name.as_str())
        .collect();
    assert_eq!(
        names[..3],
        [
            jar::MANIFEST_ENTRY,
            jar::SIGNATURE_FILE_ENTRY,
            jar::SIGNATURE_BLOCK_ENTRY
        ]
    );
    assert_eq!(names.last(), Some(&BUNDLE_PACKAGE_ASSET_ENTRY));

    let manifest = ProtoXml::parse(
        &zip::read_entry(&mut file, index.entry(BUNDLE_MANIFEST_ENTRY).unwrap()).unwrap(),
    )
    .unwrap();
    let facts = proto_xml::manifest_facts(&manifest).unwrap();
    assert_eq!(facts.package, "com.example.game_one");
    assert_eq!(facts.version_code, 42);
    assert_eq!(facts.version_name, "1.2.3");
    assert_eq!(facts.label, "Game One ゲーム");
    assert_eq!(facts.orientation, axml::SCREEN_ORIENTATION_SENSOR_PORTRAIT);
    assert!(!facts.debuggable);

    let table = ResourceTable::parse(
        &zip::read_entry(&mut file, index.entry(BUNDLE_RESOURCES_ENTRY).unwrap()).unwrap(),
    )
    .unwrap();
    assert_eq!(table.package_names().unwrap(), ["com.example.game_one"]);
    assert_eq!(table.color_count(0xFF13_579B).unwrap(), 0);
    assert_eq!(table.color_count(0xFF24_68AC).unwrap(), 0);
    assert!(table.color_count(0xFF12_AB34).unwrap() > 0);
    assert!(table.color_count(0xFF00_0000).unwrap() > 0);

    let package = index.entry(BUNDLE_PACKAGE_ASSET_ENTRY).unwrap();
    assert!(package.is_stored());
    let mut reader = StandaloneChunkedPayloadReader::open_range(
        path,
        package.data_offset,
        package.compressed_size,
    )
    .unwrap();
    assert_eq!(reader.plaintext_len(), result.package_bin_bytes);
    let mut head = [0u8; 16];
    assert_eq!(reader.read_at(0, &mut head).unwrap(), 16);

    assert_eq!(
        jar::verify(path, &|_, _| {}).unwrap(),
        KEY.certificate_sha256()
    );

    if let Ok(keep) = std::env::var("ROUTEVN_ANDROID_BUNDLE_KEEP") {
        std::fs::copy(path, &keep).unwrap();
        std::fs::write(
            format!("{keep}.p12"),
            KEY.to_pkcs12("android", "upload").unwrap(),
        )
        .unwrap();
    }
}

#[test]
fn a_changed_entry_fails_verification() {
    let Some((template, descriptor)) = template_paths() else {
        return;
    };
    let work = tempfile::tempdir().unwrap();
    let mut request = bundle_request(work.path(), &template, &descriptor);
    request.orientation = routevn_android_export::Orientation::Landscape;
    export_android_app_bundle(&request, &KEY, None).unwrap();

    // Copies the signed bundle with one entry's data changed.
    let changed = work.path().join("changed.aab");
    let mut source = File::open(&request.output_path).unwrap();
    let index = zip::read_index(&mut source).unwrap();
    let mut writer = zip::ZipWriter::new(File::create(&changed).unwrap());
    for entry in &index.entries {
        if entry.name == "base/assets/web/index.html" {
            let mut bytes = zip::read_entry(&mut source, entry).unwrap();
            bytes.extend_from_slice(b"<!-- changed -->");
            writer.add_stored(&entry.name, &bytes).unwrap();
        } else {
            writer.copy_entry(&mut source, entry).unwrap();
        }
    }
    writer.finish().unwrap();
    let error = jar::verify(&changed, &|_, _| {}).unwrap_err();
    assert_eq!(error.code, ErrorCode::ValidationFailed);
    assert!(error.message.contains("index.html"), "{}", error.message);
}

#[test]
fn refuses_the_apk_template_as_a_bundle_template() {
    let Some((_, descriptor)) = template_paths() else {
        return;
    };
    let work = tempfile::tempdir().unwrap();
    let apk = template_dir().join("RouteVNPlayerTemplate.apk");
    let request = bundle_request(work.path(), &apk, &descriptor);
    let error = export_android_app_bundle(&request, &KEY, None).unwrap_err();
    assert_eq!(error.code, ErrorCode::TemplateInvalid);
    assert!(!request.output_path.exists());
}

#[test]
fn the_committed_descriptor_matches_the_template() {
    let Some((template, descriptor)) = template_paths() else {
        return;
    };
    let committed = bundle::load_descriptor(&template, &descriptor).unwrap();
    assert_eq!(bundle::describe(&template).unwrap(), committed);
}
