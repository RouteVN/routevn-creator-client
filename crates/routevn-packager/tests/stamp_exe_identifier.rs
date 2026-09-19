use std::fs;
use std::path::PathBuf;

use routevn_packager::payload::{
    read_self_contained_embedded_payload_metadata, read_self_contained_embedded_payload_range,
};
use routevn_packager::{PackagerError, run_with_args};

const PNG_64: &[u8] = &[
    0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n', 0, 0, 0, 13, b'I', b'H', b'D', b'R', 0, 0,
    0, 64, 0, 0, 0, 64, 8, 6, 0, 0, 0, 0xaa, 0x69, 0x71, 0xde,
];

const TITLE: &str = "Project One";

struct StampFixture {
    directory: tempfile::TempDir,
}

impl StampFixture {
    fn create() -> Self {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("template.exe"), minimal_pe()).unwrap();
        fs::write(directory.path().join("package.bin"), sample_payload()).unwrap();
        fs::write(directory.path().join("icon.png"), PNG_64).unwrap();
        Self { directory }
    }

    fn out_path(&self, name: &str) -> PathBuf {
        self.directory.path().join(name)
    }

    fn command(&self, out_name: &str, identifier: Option<&str>) -> Vec<String> {
        let root = self.directory.path();
        let mut args = vec![
            "routevn-packager".to_string(),
            "stamp-exe".to_string(),
            format!("--template={}", root.join("template.exe").display()),
            format!("--payload={}", root.join("package.bin").display()),
            format!("--out={}", root.join(out_name).display()),
            format!("--title={TITLE}"),
            "--version=1.2.3".to_string(),
            format!("--icon={}", root.join("icon.png").display()),
        ];
        if let Some(identifier) = identifier {
            args.push(format!("--identifier={identifier}"));
        }
        args
    }
}

#[test]
fn stamps_valid_identifier_for_spaced_title_into_metadata() {
    let fixture = StampFixture::create();
    run_with_args(fixture.command("Project One.exe", Some("com.example.project-one"))).unwrap();

    let stamped = fs::read(fixture.out_path("Project One.exe")).unwrap();
    assert_eq!(
        version_string(&stamped, "InternalName"),
        "com.example.project-one"
    );
    assert_eq!(version_string(&stamped, "ProductName"), TITLE);
}

#[test]
fn requires_identifier_argument() {
    let fixture = StampFixture::create();
    let error = run_with_args(fixture.command("Project One.exe", None)).unwrap_err();

    let PackagerError::Clap(clap_error) = &error else {
        panic!("expected a CLI parse error, got: {error}");
    };
    let message = clap_error.to_string();
    assert!(
        message.contains("--identifier"),
        "missing --identifier is not reported: {message}"
    );
    assert!(
        message.contains("required"),
        "--identifier is not reported as required: {message}"
    );
    assert!(!fixture.out_path("Project One.exe").exists());
}

#[test]
fn rejects_invalid_identifiers() {
    let fixture = StampFixture::create();
    for identifier in [
        "Project One",
        "project-one",
        "com..game",
        "../game",
        "com.game!",
        "",
    ] {
        let error =
            run_with_args(fixture.command("Project One.exe", Some(identifier))).unwrap_err();
        assert!(
            matches!(error, PackagerError::InvalidIdentifier { .. }),
            "accepted invalid identifier {identifier:?}: {error}"
        );
        assert!(
            !fixture.out_path("Project One.exe").exists(),
            "rejected identifier {identifier:?} still wrote an executable"
        );
    }
}

#[test]
fn rejects_reserved_shell_identifier_case_insensitively() {
    let fixture = StampFixture::create();
    for identifier in ["vn.routevn.shell", "VN.RouteVN.Shell", "Vn.Routevn.Shell"] {
        let error =
            run_with_args(fixture.command("Project One.exe", Some(identifier))).unwrap_err();
        assert!(
            error.to_string().contains("reserved"),
            "reserved identifier {identifier:?} was not rejected as reserved: {error}"
        );
        assert!(
            !fixture.out_path("Project One.exe").exists(),
            "reserved identifier {identifier:?} still wrote an executable"
        );
    }
}

#[test]
fn preserves_encrypted_payload_after_stamp() {
    let fixture = StampFixture::create();
    let mut args = fixture.command("Project One.exe", Some("com.example.project-one"));
    args.push(format!("--key-hex={}", "42".repeat(32)));
    args.push(format!("--nonce-hex={}", "24".repeat(24)));
    run_with_args(args).unwrap();

    let out = fixture.out_path("Project One.exe");
    let payload = sample_payload();
    let metadata = read_self_contained_embedded_payload_metadata(&out).unwrap();
    assert_eq!(metadata.plaintext_len, payload.len() as u64);
    assert_eq!(metadata.segment_count, 1);

    let restored =
        read_self_contained_embedded_payload_range(&out, 0, payload.len() as u64).unwrap();
    assert_eq!(restored, payload);

    let stamped = fs::read(&out).unwrap();
    assert_eq!(
        version_string(&stamped, "InternalName"),
        "com.example.project-one"
    );
}

fn sample_payload() -> Vec<u8> {
    (0..4096u32).map(|index| (index % 251) as u8).collect()
}

// Read the named string block from this fixture's version resource, including
// its DWORD padding, so putting the identifier in a different field fails.
fn version_string(bytes: &[u8], name: &str) -> String {
    let key: Vec<u8> = name
        .encode_utf16()
        .chain(Some(0))
        .flat_map(|unit| unit.to_le_bytes())
        .collect();
    let key_offset = bytes
        .windows(key.len())
        .position(|window| window == key)
        .unwrap_or_else(|| panic!("missing version resource string {name}"));
    let value_offset = (key_offset + key.len() + 3) & !3;
    let value: Vec<u16> = bytes[value_offset..]
        .chunks_exact(2)
        .map(|unit| u16::from_le_bytes([unit[0], unit[1]]))
        .take_while(|unit| *unit != 0)
        .collect();
    String::from_utf16(&value).unwrap()
}

fn minimal_pe() -> Vec<u8> {
    let mut bytes = vec![0u8; 0x400];
    bytes[0] = b'M';
    bytes[1] = b'Z';
    write_u32(&mut bytes, 0x3c, 0x80);
    bytes[0x80..0x84].copy_from_slice(b"PE\0\0");
    write_u16(&mut bytes, 0x84, 0x8664);
    write_u16(&mut bytes, 0x86, 1);
    write_u16(&mut bytes, 0x94, 0xf0);
    write_u16(&mut bytes, 0x98, 0x20b);
    write_u32(&mut bytes, 0xb8, 0x1000);
    write_u32(&mut bytes, 0xbc, 0x200);
    write_u32(&mut bytes, 0xd0, 0x2000);
    write_u32(&mut bytes, 0xd4, 0x200);
    write_u32(&mut bytes, 0x104, 16);
    let section = 0x188;
    bytes[section..section + 8].copy_from_slice(b".text\0\0\0");
    write_u32(&mut bytes, section + 8, 1);
    write_u32(&mut bytes, section + 12, 0x1000);
    write_u32(&mut bytes, section + 16, 0x200);
    write_u32(&mut bytes, section + 20, 0x200);
    write_u32(&mut bytes, section + 36, 0x6000_0020);
    bytes
}

fn write_u16(bytes: &mut [u8], offset: usize, value: u16) {
    bytes[offset..offset + 2].copy_from_slice(&value.to_le_bytes());
}

fn write_u32(bytes: &mut [u8], offset: usize, value: u32) {
    bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}
