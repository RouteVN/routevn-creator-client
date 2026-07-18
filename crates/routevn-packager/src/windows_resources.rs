use std::fs;
use std::path::{Path, PathBuf};

use crate::errors::{PackagerError, Result};

const DOS_PE_POINTER_OFFSET: usize = 0x3c;
const PE_SIGNATURE: &[u8; 4] = b"PE\0\0";
const COFF_HEADER_SIZE: usize = 20;
const SECTION_HEADER_SIZE: usize = 40;
const IMAGE_NUMBEROF_DIRECTORY_ENTRIES_OFFSET_PE32: usize = 92;
const IMAGE_NUMBEROF_DIRECTORY_ENTRIES_OFFSET_PE32_PLUS: usize = 108;
const IMAGE_DATA_DIRECTORY_OFFSET_PE32: usize = 96;
const IMAGE_DATA_DIRECTORY_OFFSET_PE32_PLUS: usize = 112;
const IMAGE_DIRECTORY_ENTRY_RESOURCE: usize = 2;
const IMAGE_SCN_CNT_INITIALIZED_DATA: u32 = 0x0000_0040;
const IMAGE_SCN_MEM_READ: u32 = 0x4000_0000;
const LANG_EN_US: u16 = 0x0409;
const CODEPAGE_UNICODE: u32 = 1200;
const RT_ICON: u16 = 3;
const RT_GROUP_ICON: u16 = 14;
const RT_VERSION: u16 = 16;
const RT_MANIFEST: u16 = 24;
const RESOURCE_ICON_ID: u16 = 1;
const RESOURCE_VERSION_ID: u16 = 1;
const RESOURCE_MANIFEST_ID: u16 = 1;
const MAX_WINDOWS_ICON_SIZE: u32 = 256;
const MIN_WINDOWS_ICON_SIZE: u32 = 64;
const WINDOWS_COMMON_CONTROLS_MANIFEST: &[u8] = br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity type="win32" name="Microsoft.Windows.Common-Controls" version="6.0.0.0" processorArchitecture="*" publicKeyToken="6595b64144ccf1df" language="*" />
    </dependentAssembly>
  </dependency>
</assembly>
"#;

#[derive(Clone, Copy, Debug)]
pub struct WindowsResourceMetadata<'a> {
    pub title: &'a str,
    pub version: &'a str,
    pub application_identifier: Option<&'a str>,
    pub publisher: Option<&'a str>,
    pub description: Option<&'a str>,
    pub copyright: Option<&'a str>,
    pub original_filename: &'a str,
}

#[derive(Debug)]
pub struct WindowsResourceStampRequest<'a> {
    pub template_path: &'a Path,
    pub output_path: &'a Path,
    pub metadata: WindowsResourceMetadata<'a>,
    pub icon_png: &'a [u8],
}

#[derive(Debug)]
pub struct WindowsResourceStampOutcome {
    pub output_path: PathBuf,
    pub resource_bytes: u32,
}

#[derive(Clone, Copy, Debug)]
struct PeLayout {
    pe_offset: usize,
    number_of_sections: u16,
    section_table_offset: usize,
    first_section_raw_offset: usize,
    file_alignment: u32,
    section_alignment: u32,
    size_of_image_offset: usize,
    checksum_offset: usize,
    resource_directory_offset: usize,
    next_section_rva: u32,
}

#[derive(Clone, Copy, Debug)]
struct SectionHeader {
    virtual_size: u32,
    virtual_address: u32,
    size_of_raw_data: u32,
    pointer_to_raw_data: u32,
}

#[derive(Clone, Copy, Debug)]
struct ParsedPngIcon<'a> {
    width: u32,
    height: u32,
    bytes: &'a [u8],
}

#[derive(Clone, Debug)]
struct ResourceData {
    bytes: Vec<u8>,
    code_page: u32,
}

#[derive(Clone, Debug)]
struct ResourceEntry {
    id: u16,
    node: ResourceNode,
}

#[derive(Clone, Debug)]
enum ResourceNode {
    Directory(Vec<ResourceEntry>),
    Data(usize),
}

#[derive(Clone, Copy, Debug)]
struct ResourceDataEntryPatch {
    entry_offset: usize,
    data_index: usize,
}

pub fn stamp_windows_resources(
    request: WindowsResourceStampRequest<'_>,
) -> Result<WindowsResourceStampOutcome> {
    let icon = parse_png_icon(request.output_path, request.icon_png)?;
    let mut executable =
        fs::read(request.template_path).map_err(|source| PackagerError::ReadFile {
            path: request.template_path.to_path_buf(),
            source,
        })?;
    let layout = parse_pe_layout(&executable, request.template_path)?;
    let resource_section = build_resource_section(
        request.output_path,
        layout.next_section_rva,
        request.metadata,
        icon,
    )?;
    append_resource_section(
        request.output_path,
        &mut executable,
        layout,
        &resource_section,
    )?;

    if let Some(parent) = request.output_path.parent() {
        fs::create_dir_all(parent).map_err(|source| PackagerError::CreateDir {
            path: parent.to_path_buf(),
            source,
        })?;
    }

    fs::write(request.output_path, executable).map_err(|source| PackagerError::WriteFile {
        path: request.output_path.to_path_buf(),
        source,
    })?;

    Ok(WindowsResourceStampOutcome {
        output_path: request.output_path.to_path_buf(),
        resource_bytes: resource_section.len() as u32,
    })
}

pub fn parse_windows_version_parts(path: &Path, version: &str) -> Result<[u16; 4]> {
    let trimmed = version.trim();
    if trimmed.is_empty() {
        return Err(invalid_windows_resource(
            path,
            "Windows executable version is required",
        ));
    }

    let raw_parts = trimmed.split('.').collect::<Vec<_>>();
    if raw_parts.len() > 4 {
        return Err(invalid_windows_resource(
            path,
            "Windows executable version must have at most four numeric parts",
        ));
    }

    let mut parts = [0u16; 4];
    for (index, raw_part) in raw_parts.iter().enumerate() {
        if raw_part.is_empty() || !raw_part.chars().all(|character| character.is_ascii_digit()) {
            return Err(invalid_windows_resource(
                path,
                "Windows executable version must be numeric dot-separated text like 1.0.0",
            ));
        }

        parts[index] = raw_part.parse::<u16>().map_err(|_| {
            invalid_windows_resource(
                path,
                "Windows executable version parts must be between 0 and 65535",
            )
        })?;
    }

    Ok(parts)
}

fn parse_pe_layout(bytes: &[u8], path: &Path) -> Result<PeLayout> {
    if bytes.len() < DOS_PE_POINTER_OFFSET + 4 {
        return Err(invalid_windows_resource(
            path,
            "file is too small for a PE header",
        ));
    }

    let pe_offset = read_u32_at(bytes, DOS_PE_POINTER_OFFSET, path)? as usize;
    let signature = checked_slice(bytes, pe_offset, PE_SIGNATURE.len(), path)?;
    if signature != PE_SIGNATURE {
        return Err(invalid_windows_resource(path, "missing PE signature"));
    }

    let coff_offset = pe_offset + PE_SIGNATURE.len();
    let number_of_sections = read_u16_at(bytes, coff_offset + 2, path)?;
    if number_of_sections == 0 {
        return Err(invalid_windows_resource(path, "PE file has no sections"));
    }

    let optional_header_size = read_u16_at(bytes, coff_offset + 16, path)? as usize;
    let optional_header_offset = coff_offset + COFF_HEADER_SIZE;
    checked_slice(bytes, optional_header_offset, optional_header_size, path)?;

    let magic = read_u16_at(bytes, optional_header_offset, path)?;
    let (directory_count_offset, directory_offset) = match magic {
        0x10b => (
            optional_header_offset + IMAGE_NUMBEROF_DIRECTORY_ENTRIES_OFFSET_PE32,
            optional_header_offset + IMAGE_DATA_DIRECTORY_OFFSET_PE32,
        ),
        0x20b => (
            optional_header_offset + IMAGE_NUMBEROF_DIRECTORY_ENTRIES_OFFSET_PE32_PLUS,
            optional_header_offset + IMAGE_DATA_DIRECTORY_OFFSET_PE32_PLUS,
        ),
        _ => {
            return Err(invalid_windows_resource(
                path,
                "unsupported PE optional header format",
            ));
        }
    };

    let optional_end = optional_header_offset + optional_header_size;
    if directory_offset + (IMAGE_DIRECTORY_ENTRY_RESOURCE + 1) * 8 > optional_end {
        return Err(invalid_windows_resource(
            path,
            "PE optional header does not include a resource data directory",
        ));
    }

    let directory_count = read_u32_at(bytes, directory_count_offset, path)?;
    if directory_count <= IMAGE_DIRECTORY_ENTRY_RESOURCE as u32 {
        return Err(invalid_windows_resource(
            path,
            "PE optional header does not expose the resource data directory",
        ));
    }

    let section_alignment = read_u32_at(bytes, optional_header_offset + 32, path)?;
    let file_alignment = read_u32_at(bytes, optional_header_offset + 36, path)?;
    if section_alignment == 0 || file_alignment == 0 {
        return Err(invalid_windows_resource(
            path,
            "PE alignment fields must be non-zero",
        ));
    }

    let section_table_offset = optional_header_offset + optional_header_size;
    let section_count = number_of_sections as usize;
    checked_slice(
        bytes,
        section_table_offset,
        section_count * SECTION_HEADER_SIZE,
        path,
    )?;

    let mut first_section_raw_offset = bytes.len();
    let mut last_section_end_rva = 0u32;
    for index in 0..section_count {
        let offset = section_table_offset + index * SECTION_HEADER_SIZE;
        let header = read_section_header(bytes, offset, path)?;
        if header.pointer_to_raw_data > 0 {
            first_section_raw_offset =
                first_section_raw_offset.min(header.pointer_to_raw_data as usize);
        }

        let mapped_size = header.virtual_size.max(header.size_of_raw_data);
        let section_end = checked_add_u32(
            header.virtual_address,
            mapped_size,
            path,
            "section RVA overflow",
        )?;
        last_section_end_rva = last_section_end_rva.max(section_end);
    }

    let next_section_rva = align_u32(last_section_end_rva, section_alignment, path)?;

    Ok(PeLayout {
        pe_offset,
        number_of_sections,
        section_table_offset,
        first_section_raw_offset,
        file_alignment,
        section_alignment,
        size_of_image_offset: optional_header_offset + 56,
        checksum_offset: optional_header_offset + 64,
        resource_directory_offset: directory_offset + IMAGE_DIRECTORY_ENTRY_RESOURCE * 8,
        next_section_rva,
    })
}

fn append_resource_section(
    path: &Path,
    executable: &mut Vec<u8>,
    layout: PeLayout,
    resource_section: &[u8],
) -> Result<()> {
    let resource_len = u32::try_from(resource_section.len())
        .map_err(|_| invalid_windows_resource(path, "Windows resource section is too large"))?;
    let section_header_offset =
        layout.section_table_offset + layout.number_of_sections as usize * SECTION_HEADER_SIZE;
    if section_header_offset + SECTION_HEADER_SIZE > layout.first_section_raw_offset {
        return Err(invalid_windows_resource(
            path,
            "PE header does not have room for an additional resource section",
        ));
    }

    let raw_pointer = align_usize(executable.len(), layout.file_alignment as usize, path)?;
    let raw_size = align_usize(resource_section.len(), layout.file_alignment as usize, path)?;
    let raw_pointer_u32 = u32::try_from(raw_pointer).map_err(|_| {
        invalid_windows_resource(path, "resource section file offset does not fit PE32")
    })?;
    let raw_size_u32 = u32::try_from(raw_size).map_err(|_| {
        invalid_windows_resource(path, "resource section file size does not fit PE32")
    })?;
    let size_of_image = align_u32(
        checked_add_u32(
            layout.next_section_rva,
            resource_len,
            path,
            "resource section RVA overflow",
        )?,
        layout.section_alignment,
        path,
    )?;

    write_u16_at(
        executable,
        layout.pe_offset + PE_SIGNATURE.len() + 2,
        layout.number_of_sections.checked_add(1).ok_or_else(|| {
            invalid_windows_resource(path, "PE section count cannot be incremented")
        })?,
        path,
    )?;
    write_u32_at(
        executable,
        layout.resource_directory_offset,
        layout.next_section_rva,
        path,
    )?;
    write_u32_at(
        executable,
        layout.resource_directory_offset + 4,
        resource_len,
        path,
    )?;
    write_u32_at(executable, layout.size_of_image_offset, size_of_image, path)?;
    write_u32_at(executable, layout.checksum_offset, 0, path)?;
    write_section_header(
        executable,
        section_header_offset,
        SectionHeader {
            virtual_size: resource_len,
            virtual_address: layout.next_section_rva,
            size_of_raw_data: raw_size_u32,
            pointer_to_raw_data: raw_pointer_u32,
        },
        path,
    )?;

    if executable.len() < raw_pointer {
        executable.resize(raw_pointer, 0);
    }
    executable.extend_from_slice(resource_section);
    executable.resize(raw_pointer + raw_size, 0);

    Ok(())
}

fn read_section_header(bytes: &[u8], offset: usize, path: &Path) -> Result<SectionHeader> {
    checked_slice(bytes, offset, SECTION_HEADER_SIZE, path)?;
    Ok(SectionHeader {
        virtual_size: read_u32_at(bytes, offset + 8, path)?,
        virtual_address: read_u32_at(bytes, offset + 12, path)?,
        size_of_raw_data: read_u32_at(bytes, offset + 16, path)?,
        pointer_to_raw_data: read_u32_at(bytes, offset + 20, path)?,
    })
}

fn write_section_header(
    bytes: &mut [u8],
    offset: usize,
    header: SectionHeader,
    path: &Path,
) -> Result<()> {
    checked_slice(bytes, offset, SECTION_HEADER_SIZE, path)?;
    bytes[offset..offset + 8].copy_from_slice(b".rsrc\0\0\0");
    write_u32_at(bytes, offset + 8, header.virtual_size, path)?;
    write_u32_at(bytes, offset + 12, header.virtual_address, path)?;
    write_u32_at(bytes, offset + 16, header.size_of_raw_data, path)?;
    write_u32_at(bytes, offset + 20, header.pointer_to_raw_data, path)?;
    write_u32_at(bytes, offset + 24, 0, path)?;
    write_u32_at(bytes, offset + 28, 0, path)?;
    write_u16_at(bytes, offset + 32, 0, path)?;
    write_u16_at(bytes, offset + 34, 0, path)?;
    write_u32_at(
        bytes,
        offset + 36,
        IMAGE_SCN_CNT_INITIALIZED_DATA | IMAGE_SCN_MEM_READ,
        path,
    )
}

fn build_resource_section(
    path: &Path,
    resource_base_rva: u32,
    metadata: WindowsResourceMetadata<'_>,
    icon: ParsedPngIcon<'_>,
) -> Result<Vec<u8>> {
    let version_info = create_version_info(path, metadata)?;
    let group_icon = create_group_icon_resource(icon, RESOURCE_ICON_ID, path)?;
    let data = vec![
        ResourceData {
            bytes: icon.bytes.to_vec(),
            code_page: 0,
        },
        ResourceData {
            bytes: group_icon,
            code_page: 0,
        },
        ResourceData {
            bytes: version_info,
            code_page: CODEPAGE_UNICODE,
        },
        ResourceData {
            bytes: WINDOWS_COMMON_CONTROLS_MANIFEST.to_vec(),
            code_page: 0,
        },
    ];
    let tree = ResourceNode::Directory(vec![
        type_resource_entry(RT_ICON, RESOURCE_ICON_ID, 0),
        type_resource_entry(RT_GROUP_ICON, RESOURCE_ICON_ID, 1),
        type_resource_entry(RT_VERSION, RESOURCE_VERSION_ID, 2),
        type_resource_entry(RT_MANIFEST, RESOURCE_MANIFEST_ID, 3),
    ]);
    let mut bytes = Vec::new();
    let mut data_entry_patches = Vec::new();

    let ResourceNode::Directory(entries) = tree else {
        unreachable!("root resource node must be a directory");
    };
    write_resource_directory(&entries, &mut bytes, &mut data_entry_patches, path)?;

    let mut data_offsets = vec![0usize; data.len()];
    for (index, item) in data.iter().enumerate() {
        align_vec(&mut bytes, 4);
        data_offsets[index] = bytes.len();
        bytes.extend_from_slice(&item.bytes);
    }

    for patch in data_entry_patches {
        let item = data.get(patch.data_index).ok_or_else(|| {
            invalid_windows_resource(path, "resource data index is out of bounds")
        })?;
        let data_offset = *data_offsets.get(patch.data_index).ok_or_else(|| {
            invalid_windows_resource(path, "resource data offset is out of bounds")
        })?;
        let data_rva = checked_add_u32(
            resource_base_rva,
            u32::try_from(data_offset).map_err(|_| {
                invalid_windows_resource(path, "resource data offset does not fit PE32")
            })?,
            path,
            "resource data RVA overflow",
        )?;
        write_u32_at(&mut bytes, patch.entry_offset, data_rva, path)?;
        write_u32_at(
            &mut bytes,
            patch.entry_offset + 4,
            u32::try_from(item.bytes.len()).map_err(|_| {
                invalid_windows_resource(path, "resource data size does not fit PE32")
            })?,
            path,
        )?;
        write_u32_at(&mut bytes, patch.entry_offset + 8, item.code_page, path)?;
        write_u32_at(&mut bytes, patch.entry_offset + 12, 0, path)?;
    }

    Ok(bytes)
}

fn type_resource_entry(type_id: u16, resource_id: u16, data_index: usize) -> ResourceEntry {
    ResourceEntry {
        id: type_id,
        node: ResourceNode::Directory(vec![ResourceEntry {
            id: resource_id,
            node: ResourceNode::Directory(vec![ResourceEntry {
                id: LANG_EN_US,
                node: ResourceNode::Data(data_index),
            }]),
        }]),
    }
}

fn write_resource_directory(
    entries: &[ResourceEntry],
    bytes: &mut Vec<u8>,
    data_entry_patches: &mut Vec<ResourceDataEntryPatch>,
    path: &Path,
) -> Result<usize> {
    let directory_offset = bytes.len();
    bytes.resize(bytes.len() + 16, 0);
    write_u16_at(
        bytes,
        directory_offset + 14,
        u16::try_from(entries.len()).map_err(|_| {
            invalid_windows_resource(path, "resource directory has too many entries")
        })?,
        path,
    )?;

    let mut sorted_entries = entries.iter().collect::<Vec<_>>();
    sorted_entries.sort_by_key(|entry| entry.id);
    let entry_table_offset = bytes.len();
    bytes.resize(bytes.len() + sorted_entries.len() * 8, 0);

    for (index, entry) in sorted_entries.iter().enumerate() {
        let entry_offset = entry_table_offset + index * 8;
        write_u32_at(bytes, entry_offset, entry.id as u32, path)?;

        match &entry.node {
            ResourceNode::Directory(children) => {
                let child_offset =
                    write_resource_directory(children, bytes, data_entry_patches, path)?;
                let child_offset_u32 = u32::try_from(child_offset).map_err(|_| {
                    invalid_windows_resource(path, "resource directory offset does not fit PE32")
                })?;
                write_u32_at(
                    bytes,
                    entry_offset + 4,
                    0x8000_0000 | child_offset_u32,
                    path,
                )?;
            }
            ResourceNode::Data(data_index) => {
                let data_entry_offset = bytes.len();
                bytes.resize(bytes.len() + 16, 0);
                data_entry_patches.push(ResourceDataEntryPatch {
                    entry_offset: data_entry_offset,
                    data_index: *data_index,
                });
                write_u32_at(
                    bytes,
                    entry_offset + 4,
                    u32::try_from(data_entry_offset).map_err(|_| {
                        invalid_windows_resource(
                            path,
                            "resource data entry offset does not fit PE32",
                        )
                    })?,
                    path,
                )?;
            }
        }
    }

    Ok(directory_offset)
}

fn parse_png_icon<'a>(path: &Path, bytes: &'a [u8]) -> Result<ParsedPngIcon<'a>> {
    if bytes.len() < 24 || &bytes[..8] != b"\x89PNG\r\n\x1a\n" || &bytes[12..16] != b"IHDR" {
        return Err(invalid_windows_resource(
            path,
            "project icon must be a PNG file",
        ));
    }

    let width = read_be_u32(&bytes[16..20]);
    let height = read_be_u32(&bytes[20..24]);
    if width != height {
        return Err(invalid_windows_resource(
            path,
            "project icon must be square for Windows export",
        ));
    }
    if width < MIN_WINDOWS_ICON_SIZE || height < MIN_WINDOWS_ICON_SIZE {
        return Err(invalid_windows_resource(
            path,
            "project icon must be at least 64x64 pixels for Windows export",
        ));
    }
    if width > MAX_WINDOWS_ICON_SIZE || height > MAX_WINDOWS_ICON_SIZE {
        return Err(invalid_windows_resource(
            path,
            "project icon must be at most 256x256 pixels for Windows export",
        ));
    }

    Ok(ParsedPngIcon {
        width,
        height,
        bytes,
    })
}

fn create_group_icon_resource(
    icon: ParsedPngIcon<'_>,
    icon_id: u16,
    path: &Path,
) -> Result<Vec<u8>> {
    let mut bytes = Vec::with_capacity(20);
    push_u16(&mut bytes, 0);
    push_u16(&mut bytes, 1);
    push_u16(&mut bytes, 1);
    bytes.push(icon_dimension_byte(icon.width));
    bytes.push(icon_dimension_byte(icon.height));
    bytes.push(0);
    bytes.push(0);
    push_u16(&mut bytes, 1);
    push_u16(&mut bytes, 32);
    push_u32(
        &mut bytes,
        u32::try_from(icon.bytes.len())
            .map_err(|_| invalid_windows_resource(path, "project icon file is too large"))?,
    );
    push_u16(&mut bytes, icon_id);
    Ok(bytes)
}

fn create_version_info(path: &Path, metadata: WindowsResourceMetadata<'_>) -> Result<Vec<u8>> {
    let version_parts = parse_windows_version_parts(path, metadata.version)?;
    let fixed = create_fixed_file_info(version_parts);
    let description = metadata
        .description
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(metadata.title);
    let internal_name = metadata
        .application_identifier
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(metadata.title);
    let mut strings = vec![
        version_string_block(path, "FileDescription", description)?,
        version_string_block(path, "FileVersion", metadata.version)?,
        version_string_block(path, "InternalName", internal_name)?,
        version_string_block(path, "OriginalFilename", metadata.original_filename)?,
        version_string_block(path, "ProductName", metadata.title)?,
        version_string_block(path, "ProductVersion", metadata.version)?,
    ];

    if let Some(publisher) = metadata
        .publisher
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        strings.push(version_string_block(path, "CompanyName", publisher)?);
    }
    if let Some(copyright) = metadata
        .copyright
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        strings.push(version_string_block(path, "LegalCopyright", copyright)?);
    }

    let string_table = version_block(path, "040904B0", 1, 0, &[], &[concat_blocks(strings)])?;
    let string_file_info = version_block(path, "StringFileInfo", 1, 0, &[], &[string_table])?;
    let translation = {
        let mut value = Vec::with_capacity(4);
        push_u16(&mut value, LANG_EN_US);
        push_u16(&mut value, 0x04b0);
        version_block(path, "Translation", 0, value.len() as u16, &value, &[])?
    };
    let var_file_info = version_block(path, "VarFileInfo", 1, 0, &[], &[translation])?;

    version_block(
        path,
        "VS_VERSION_INFO",
        0,
        fixed.len() as u16,
        &fixed,
        &[string_file_info, var_file_info],
    )
}

fn create_fixed_file_info(version_parts: [u16; 4]) -> Vec<u8> {
    let file_version_ms = ((version_parts[0] as u32) << 16) | version_parts[1] as u32;
    let file_version_ls = ((version_parts[2] as u32) << 16) | version_parts[3] as u32;
    let mut bytes = Vec::with_capacity(52);

    push_u32(&mut bytes, 0xFEEF_04BD);
    push_u32(&mut bytes, 0x0001_0000);
    push_u32(&mut bytes, file_version_ms);
    push_u32(&mut bytes, file_version_ls);
    push_u32(&mut bytes, file_version_ms);
    push_u32(&mut bytes, file_version_ls);
    push_u32(&mut bytes, 0x0000_003F);
    push_u32(&mut bytes, 0);
    push_u32(&mut bytes, 0x0004_0004);
    push_u32(&mut bytes, 0x0000_0001);
    push_u32(&mut bytes, 0);
    push_u32(&mut bytes, 0);
    push_u32(&mut bytes, 0);

    bytes
}

fn version_string_block(path: &Path, key: &str, value: &str) -> Result<Vec<u8>> {
    let value_bytes = utf16le_null_terminated(value);
    let value_units = u16::try_from(value.encode_utf16().count() + 1)
        .map_err(|_| invalid_windows_resource(path, "Windows version string value is too long"))?;
    version_block(path, key, 1, value_units, &value_bytes, &[])
}

fn version_block(
    path: &Path,
    key: &str,
    value_type: u16,
    value_length: u16,
    value: &[u8],
    children: &[Vec<u8>],
) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    push_u16(&mut bytes, 0);
    push_u16(&mut bytes, value_length);
    push_u16(&mut bytes, value_type);
    bytes.extend_from_slice(&utf16le_null_terminated(key));
    align_vec(&mut bytes, 4);
    bytes.extend_from_slice(value);
    align_vec(&mut bytes, 4);
    for child in children {
        bytes.extend_from_slice(child);
    }

    let length = u16::try_from(bytes.len()).map_err(|_| {
        invalid_windows_resource(path, "Windows version resource block is too large")
    })?;
    bytes[0..2].copy_from_slice(&length.to_le_bytes());

    Ok(bytes)
}

fn concat_blocks(blocks: Vec<Vec<u8>>) -> Vec<u8> {
    let mut bytes = Vec::new();
    for block in blocks {
        bytes.extend_from_slice(&block);
    }
    bytes
}

fn utf16le_null_terminated(value: &str) -> Vec<u8> {
    let mut bytes = Vec::new();
    for unit in value.encode_utf16() {
        push_u16(&mut bytes, unit);
    }
    push_u16(&mut bytes, 0);
    bytes
}

fn icon_dimension_byte(value: u32) -> u8 {
    if value >= 256 { 0 } else { value as u8 }
}

fn align_vec(bytes: &mut Vec<u8>, alignment: usize) {
    let aligned = align_usize_infallible(bytes.len(), alignment);
    bytes.resize(aligned, 0);
}

fn align_usize(value: usize, alignment: usize, path: &Path) -> Result<usize> {
    if alignment == 0 {
        return Err(invalid_windows_resource(path, "alignment must be non-zero"));
    }

    value
        .checked_add(alignment - 1)
        .map(|value| value / alignment * alignment)
        .ok_or_else(|| invalid_windows_resource(path, "aligned value overflows"))
}

fn align_usize_infallible(value: usize, alignment: usize) -> usize {
    if alignment == 0 {
        return value;
    }
    value.div_ceil(alignment) * alignment
}

fn align_u32(value: u32, alignment: u32, path: &Path) -> Result<u32> {
    if alignment == 0 {
        return Err(invalid_windows_resource(path, "alignment must be non-zero"));
    }

    value
        .checked_add(alignment - 1)
        .map(|value| value / alignment * alignment)
        .ok_or_else(|| invalid_windows_resource(path, "aligned value overflows"))
}

fn checked_add_u32(left: u32, right: u32, path: &Path, message: &str) -> Result<u32> {
    left.checked_add(right)
        .ok_or_else(|| invalid_windows_resource(path, message))
}

fn checked_slice<'a>(bytes: &'a [u8], offset: usize, len: usize, path: &Path) -> Result<&'a [u8]> {
    let end = offset
        .checked_add(len)
        .ok_or_else(|| invalid_windows_resource(path, "PE field range overflows"))?;
    bytes
        .get(offset..end)
        .ok_or_else(|| invalid_windows_resource(path, "PE field range is out of bounds"))
}

fn read_u16_at(bytes: &[u8], offset: usize, path: &Path) -> Result<u16> {
    let field = checked_slice(bytes, offset, 2, path)?;
    Ok(u16::from_le_bytes([field[0], field[1]]))
}

fn read_u32_at(bytes: &[u8], offset: usize, path: &Path) -> Result<u32> {
    let field = checked_slice(bytes, offset, 4, path)?;
    Ok(u32::from_le_bytes([field[0], field[1], field[2], field[3]]))
}

fn write_u16_at(bytes: &mut [u8], offset: usize, value: u16, path: &Path) -> Result<()> {
    let field = checked_slice_mut(bytes, offset, 2, path)?;
    field.copy_from_slice(&value.to_le_bytes());
    Ok(())
}

fn write_u32_at(bytes: &mut [u8], offset: usize, value: u32, path: &Path) -> Result<()> {
    let field = checked_slice_mut(bytes, offset, 4, path)?;
    field.copy_from_slice(&value.to_le_bytes());
    Ok(())
}

fn checked_slice_mut<'a>(
    bytes: &'a mut [u8],
    offset: usize,
    len: usize,
    path: &Path,
) -> Result<&'a mut [u8]> {
    let end = offset
        .checked_add(len)
        .ok_or_else(|| invalid_windows_resource(path, "PE field range overflows"))?;
    bytes
        .get_mut(offset..end)
        .ok_or_else(|| invalid_windows_resource(path, "PE field range is out of bounds"))
}

fn push_u16(bytes: &mut Vec<u8>, value: u16) {
    bytes.extend_from_slice(&value.to_le_bytes());
}

fn push_u32(bytes: &mut Vec<u8>, value: u32) {
    bytes.extend_from_slice(&value.to_le_bytes());
}

fn read_be_u32(bytes: &[u8]) -> u32 {
    u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
}

fn invalid_windows_resource(path: &Path, message: impl Into<String>) -> PackagerError {
    PackagerError::InvalidWindowsResource {
        path: path.to_path_buf(),
        message: message.into(),
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;

    use tempfile::tempdir;

    use super::{
        WINDOWS_COMMON_CONTROLS_MANIFEST, WindowsResourceMetadata, WindowsResourceStampRequest,
        parse_windows_version_parts, stamp_windows_resources,
    };

    const PNG_64: &[u8] = &[
        0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n', 0, 0, 0, 13, b'I', b'H', b'D', b'R', 0,
        0, 0, 64, 0, 0, 0, 64, 8, 6, 0, 0, 0, 0xaa, 0x69, 0x71, 0xde,
    ];

    #[test]
    fn parses_numeric_windows_version_parts() {
        assert_eq!(
            parse_windows_version_parts(Path::new("app.exe"), "1.2.3").unwrap(),
            [1, 2, 3, 0],
        );
        assert!(parse_windows_version_parts(Path::new("app.exe"), "1.2-beta").is_err());
    }

    #[test]
    fn stamps_minimal_pe_with_resource_section() {
        let temp = tempdir().unwrap();
        let template_path = temp.path().join("template.exe");
        let output_path = temp.path().join("My Game.exe");
        fs::write(&template_path, minimal_pe()).unwrap();

        let outcome = stamp_windows_resources(WindowsResourceStampRequest {
            template_path: &template_path,
            output_path: &output_path,
            metadata: WindowsResourceMetadata {
                title: "My Game",
                version: "1.2.3",
                application_identifier: Some("com.example.my-game"),
                publisher: Some("Studio"),
                description: Some("A visual novel"),
                copyright: Some("Copyright 2026 Studio"),
                original_filename: "My Game.exe",
            },
            icon_png: PNG_64,
        })
        .unwrap();

        let stamped = fs::read(&outcome.output_path).unwrap();
        assert_eq!(u16::from_le_bytes([stamped[0x86], stamped[0x87]]), 2);

        let resource_rva = u32::from_le_bytes([
            stamped[0x118],
            stamped[0x119],
            stamped[0x11a],
            stamped[0x11b],
        ]);
        let resource_size = u32::from_le_bytes([
            stamped[0x11c],
            stamped[0x11d],
            stamped[0x11e],
            stamped[0x11f],
        ]);
        assert_eq!(resource_rva, 0x2000);
        assert!(resource_size > 0);
        assert!(outcome.resource_bytes > 0);
        assert!(stamped.windows(PNG_64.len()).any(|window| window == PNG_64));
        assert!(
            stamped
                .windows(WINDOWS_COMMON_CONTROLS_MANIFEST.len())
                .any(|window| window == WINDOWS_COMMON_CONTROLS_MANIFEST)
        );
        let title_marker = utf16le("My Game");
        assert!(
            stamped
                .windows(title_marker.len())
                .any(|window| window == title_marker.as_slice())
        );
        for value in [
            "com.example.my-game",
            "A visual novel",
            "Copyright 2026 Studio",
        ] {
            let marker = utf16le(value);
            assert!(
                stamped
                    .windows(marker.len())
                    .any(|window| window == marker.as_slice())
            );
        }
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

    fn utf16le(value: &str) -> Vec<u8> {
        let mut bytes = Vec::new();
        for unit in value.encode_utf16() {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        bytes
    }
}
