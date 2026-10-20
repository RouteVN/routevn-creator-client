// Shared by several integration test crates, each of which uses a subset.
#![allow(dead_code)]

pub const PNG_64: &[u8] = &[
    0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n', 0, 0, 0, 13, b'I', b'H', b'D', b'R', 0, 0,
    0, 64, 0, 0, 0, 64, 8, 6, 0, 0, 0, 0xaa, 0x69, 0x71, 0xde,
];

pub fn minimal_pe() -> Vec<u8> {
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

pub fn write_u16(bytes: &mut [u8], offset: usize, value: u16) {
    bytes[offset..offset + 2].copy_from_slice(&value.to_le_bytes());
}

pub fn write_u32(bytes: &mut [u8], offset: usize, value: u32) {
    bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}
