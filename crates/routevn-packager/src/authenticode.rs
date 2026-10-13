//! PE fields that Authenticode signing rewrites.
//!
//! Signing a finished export appends a certificate table to the end of the
//! file and updates the PE checksum and the certificate-table data directory
//! entry in the headers. The payload reader therefore has to look for its
//! footer before the certificate table and ignore those header fields when it
//! derives the key mask, which is also how Authenticode leaves them out of the
//! file hash.

use std::ops::Range;

const DOS_PE_POINTER_OFFSET: usize = 0x3c;
const PE_SIGNATURE: &[u8; 4] = b"PE\0\0";
const COFF_HEADER_SIZE: usize = 20;
const OPTIONAL_HEADER_CHECKSUM_OFFSET: usize = 64;
const NUMBER_OF_DIRECTORIES_OFFSET_PE32: usize = 92;
const NUMBER_OF_DIRECTORIES_OFFSET_PE32_PLUS: usize = 108;
const DATA_DIRECTORY_OFFSET_PE32: usize = 96;
const DATA_DIRECTORY_OFFSET_PE32_PLUS: usize = 112;
const DIRECTORY_ENTRY_SECURITY: usize = 4;
const DIRECTORY_ENTRY_SIZE: usize = 8;

pub(crate) const CERTIFICATE_TABLE_ALIGNMENT: u64 = 8;

/// The PE headers of an executable fit in this many leading bytes. Fields
/// that sit beyond it are not treated as signature fields.
pub(crate) const PE_HEADER_WINDOW: usize = 64 * 1024;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct SignatureFields {
    checksum: Range<usize>,
    certificate_entry: Range<usize>,
}

/// Locates the PE checksum and the certificate-table directory entry in
/// `header`, the leading bytes of the file. Returns `None` for anything that
/// is not a PE image with such an entry, such as a standalone payload file.
pub(crate) fn signature_fields(header: &[u8]) -> Option<SignatureFields> {
    let pe_offset = read_u32(header, DOS_PE_POINTER_OFFSET)? as usize;
    if header.get(pe_offset..pe_offset.checked_add(PE_SIGNATURE.len())?)? != PE_SIGNATURE {
        return None;
    }

    let coff_offset = pe_offset + PE_SIGNATURE.len();
    let optional_header_size = read_u16(header, coff_offset + 16)? as usize;
    let optional_header_offset = coff_offset + COFF_HEADER_SIZE;
    let optional_header_end = optional_header_offset.checked_add(optional_header_size)?;

    let (directory_count_offset, directory_offset) = match read_u16(header, optional_header_offset)?
    {
        0x10b => (
            optional_header_offset + NUMBER_OF_DIRECTORIES_OFFSET_PE32,
            optional_header_offset + DATA_DIRECTORY_OFFSET_PE32,
        ),
        0x20b => (
            optional_header_offset + NUMBER_OF_DIRECTORIES_OFFSET_PE32_PLUS,
            optional_header_offset + DATA_DIRECTORY_OFFSET_PE32_PLUS,
        ),
        _ => return None,
    };

    let entry_start = directory_offset + DIRECTORY_ENTRY_SECURITY * DIRECTORY_ENTRY_SIZE;
    let entry_end = entry_start + DIRECTORY_ENTRY_SIZE;
    if entry_end > optional_header_end || entry_end > header.len() {
        return None;
    }
    if (read_u32(header, directory_count_offset)? as usize) <= DIRECTORY_ENTRY_SECURITY {
        return None;
    }

    let checksum_start = optional_header_offset + OPTIONAL_HEADER_CHECKSUM_OFFSET;
    Some(SignatureFields {
        checksum: checksum_start..checksum_start + 4,
        certificate_entry: entry_start..entry_end,
    })
}

impl SignatureFields {
    /// Zeroes the checksum and the certificate-table entry in `header`, the
    /// same bytes `signature_fields` was parsed from.
    pub(crate) fn zero(&self, header: &mut [u8]) {
        header[self.checksum.clone()].fill(0);
        header[self.certificate_entry.clone()].fill(0);
    }

    /// File offset where the certificate table starts, if the headers say the
    /// file is signed and the table lies within the file.
    fn certificate_table_offset(&self, header: &[u8], file_len: u64) -> Option<u64> {
        let offset = u64::from(read_u32(header, self.certificate_entry.start)?);
        let size = u64::from(read_u32(header, self.certificate_entry.start + 4)?);
        if offset == 0 || size == 0 || offset.checked_add(size)? > file_len {
            return None;
        }

        Some(offset)
    }
}

/// File offset where the certificate table of a signed executable starts.
/// `header` holds the leading bytes of the file, as signed.
///
/// The table starts on an 8-byte boundary, so signing pads the file with up to
/// `CERTIFICATE_TABLE_ALIGNMENT - 1` zero bytes after whatever was appended to
/// the executable.
pub(crate) fn certificate_table_offset(header: &[u8], file_len: u64) -> Option<u64> {
    signature_fields(header)?.certificate_table_offset(header, file_len)
}

fn read_u16(bytes: &[u8], offset: usize) -> Option<u16> {
    let value = bytes.get(offset..offset.checked_add(2)?)?;
    Some(u16::from_le_bytes([value[0], value[1]]))
}

fn read_u32(bytes: &[u8], offset: usize) -> Option<u32> {
    let value = bytes.get(offset..offset.checked_add(4)?)?;
    Some(u32::from_le_bytes([value[0], value[1], value[2], value[3]]))
}

#[cfg(test)]
mod tests {
    use super::{certificate_table_offset, signature_fields};

    const OPTIONAL_HEADER_OFFSET: usize = 0x98;

    fn pe_header(magic: u16) -> Vec<u8> {
        let (optional_header_size, directory_count_offset) = match magic {
            0x20b => (0xf0u16, 108),
            _ => (0xe0u16, 92),
        };
        let mut bytes = vec![0u8; 0x400];
        bytes[0x3c..0x40].copy_from_slice(&0x80u32.to_le_bytes());
        bytes[0x80..0x84].copy_from_slice(b"PE\0\0");
        bytes[0x94..0x96].copy_from_slice(&optional_header_size.to_le_bytes());
        write_u16(&mut bytes, OPTIONAL_HEADER_OFFSET, magic);
        write_u32(
            &mut bytes,
            OPTIONAL_HEADER_OFFSET + directory_count_offset,
            16,
        );
        bytes
    }

    fn write_u16(bytes: &mut [u8], offset: usize, value: u16) {
        bytes[offset..offset + 2].copy_from_slice(&value.to_le_bytes());
    }

    fn write_u32(bytes: &mut [u8], offset: usize, value: u32) {
        bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
    }

    #[test]
    fn locates_signature_fields_in_pe32_plus_headers() {
        let fields = signature_fields(&pe_header(0x20b)).unwrap();

        assert_eq!(fields.checksum, 0xd8..0xdc);
        assert_eq!(fields.certificate_entry, 0x128..0x130);
    }

    #[test]
    fn locates_signature_fields_in_pe32_headers() {
        let fields = signature_fields(&pe_header(0x10b)).unwrap();

        assert_eq!(fields.checksum, 0xd8..0xdc);
        assert_eq!(fields.certificate_entry, 0x118..0x120);
    }

    #[test]
    fn zeroes_only_the_signature_fields() {
        let mut header = pe_header(0x20b);
        header.fill(0xaa);
        let original = pe_header(0x20b);
        header[..original.len()].copy_from_slice(&original);
        write_u32(&mut header, 0xd8, u32::MAX);
        write_u32(&mut header, 0x128, u32::MAX);
        write_u32(&mut header, 0x12c, u32::MAX);
        write_u32(&mut header, 0xdc, 7);
        write_u32(&mut header, 0x124, 7);
        write_u32(&mut header, 0x130, 7);

        let fields = signature_fields(&header).unwrap();
        fields.zero(&mut header);

        let mut expected = original;
        write_u32(&mut expected, 0xdc, 7);
        write_u32(&mut expected, 0x124, 7);
        write_u32(&mut expected, 0x130, 7);
        assert_eq!(header, expected);
    }

    #[test]
    fn ignores_files_without_a_certificate_table_entry() {
        assert_eq!(signature_fields(b"fake executable bytes"), None);
        assert_eq!(signature_fields(&[]), None);

        let mut not_pe = pe_header(0x20b);
        not_pe[0x80] = b'X';
        assert_eq!(signature_fields(&not_pe), None);

        let mut unknown_format = pe_header(0x20b);
        write_u16(&mut unknown_format, OPTIONAL_HEADER_OFFSET, 0x107);
        assert_eq!(signature_fields(&unknown_format), None);

        let mut few_directories = pe_header(0x20b);
        write_u32(&mut few_directories, OPTIONAL_HEADER_OFFSET + 108, 4);
        assert_eq!(signature_fields(&few_directories), None);

        let truncated = pe_header(0x20b);
        assert_eq!(signature_fields(&truncated[..0x120]), None);

        let mut pointer_past_header = pe_header(0x20b);
        write_u32(&mut pointer_past_header, 0x3c, u32::MAX);
        assert_eq!(signature_fields(&pointer_past_header), None);
    }

    #[test]
    fn finds_the_certificate_table_only_when_it_lies_inside_the_file() {
        let mut header = pe_header(0x20b);
        assert_eq!(certificate_table_offset(&header, 0x600), None);

        write_u32(&mut header, 0x128, 0x500);
        write_u32(&mut header, 0x12c, 0x100);
        assert_eq!(certificate_table_offset(&header, 0x600), Some(0x500));
        assert_eq!(certificate_table_offset(&header, 0x5ff), None);

        write_u32(&mut header, 0x12c, 0);
        assert_eq!(certificate_table_offset(&header, 0x600), None);

        write_u32(&mut header, 0x128, u32::MAX);
        write_u32(&mut header, 0x12c, u32::MAX);
        assert_eq!(certificate_table_offset(&header, u32::MAX.into()), None);
    }
}
