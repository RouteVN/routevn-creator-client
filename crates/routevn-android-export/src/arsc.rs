//! Minimal `resources.arsc` reader.
//!
//! The exporter never restructures the resource table. It only needs to find
//! where two color values live, so it can overwrite them in place, and which
//! files implement the launcher and splash icons at each density.

use crate::axml::StringPool;
use crate::error::{ExportError, Result};

const RES_TABLE_TYPE: u16 = 0x0002;
const RES_STRING_POOL_TYPE: u16 = 0x0001;
const RES_TABLE_PACKAGE_TYPE: u16 = 0x0200;
const RES_TABLE_TYPE_TYPE: u16 = 0x0201;

const FLAG_SPARSE: u8 = 0x01;
const FLAG_OFFSET16: u8 = 0x02;
const ENTRY_FLAG_COMPLEX: u16 = 0x0001;
const ENTRY_FLAG_COMPACT: u16 = 0x0008;
const NO_ENTRY_32: u32 = 0xFFFF_FFFF;
const NO_ENTRY_16: u16 = 0xFFFF;

const TYPE_STRING: u8 = 0x03;
const TYPE_FIRST_COLOR: u8 = 0x1c;
const TYPE_LAST_COLOR: u8 = 0x1f;

/// Offset of `density` inside `ResTable_config`.
const CONFIG_DENSITY_OFFSET: usize = 14;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResourceValue {
    pub type_name: String,
    pub key: String,
    pub density: u16,
    pub value_type: u8,
    pub data: u32,
    /// Offset of the 4-byte `data` field inside `resources.arsc`.
    pub data_offset: usize,
}

fn invalid(message: impl Into<String>) -> ExportError {
    ExportError::template(format!("Invalid resources.arsc: {}", message.into()))
}

fn u8_at(bytes: &[u8], offset: usize) -> Result<u8> {
    bytes
        .get(offset)
        .copied()
        .ok_or_else(|| invalid("unexpected end of data"))
}

fn u16_at(bytes: &[u8], offset: usize) -> Result<u16> {
    bytes
        .get(offset..offset + 2)
        .map(|slice| u16::from_le_bytes([slice[0], slice[1]]))
        .ok_or_else(|| invalid("unexpected end of data"))
}

fn u32_at(bytes: &[u8], offset: usize) -> Result<u32> {
    bytes
        .get(offset..offset + 4)
        .map(|slice| u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]))
        .ok_or_else(|| invalid("unexpected end of data"))
}

pub struct ResourceTable {
    pub global_strings: StringPool,
    pub values: Vec<ResourceValue>,
}

impl ResourceTable {
    pub fn parse(bytes: &[u8]) -> Result<Self> {
        if u16_at(bytes, 0)? != RES_TABLE_TYPE {
            return Err(invalid("missing table header"));
        }
        let header_size = u16_at(bytes, 2)? as usize;
        if u32_at(bytes, 4)? as usize != bytes.len() {
            return Err(invalid("table size does not match its header"));
        }

        let mut global_strings = None;
        let mut values = Vec::new();
        let mut cursor = header_size;
        while cursor < bytes.len() {
            let chunk_type = u16_at(bytes, cursor)?;
            let chunk_size = u32_at(bytes, cursor + 4)? as usize;
            if chunk_size < 8 || cursor + chunk_size > bytes.len() {
                return Err(invalid("chunk size is out of range"));
            }
            let chunk = &bytes[cursor..cursor + chunk_size];
            match chunk_type {
                RES_STRING_POOL_TYPE if global_strings.is_none() => {
                    global_strings = Some(StringPool::parse(chunk)?.0);
                }
                RES_TABLE_PACKAGE_TYPE => parse_package(chunk, cursor, &mut values)?,
                _ => {}
            }
            cursor += chunk_size;
        }

        Ok(Self {
            global_strings: global_strings.ok_or_else(|| invalid("missing value strings"))?,
            values,
        })
    }

    /// Color values of type `color` that hold exactly `argb`.
    pub fn color_offsets(&self, argb: u32) -> Vec<usize> {
        self.values
            .iter()
            .filter(|value| {
                value.type_name == "color"
                    && (TYPE_FIRST_COLOR..=TYPE_LAST_COLOR).contains(&value.value_type)
                    && value.data == argb
            })
            .map(|value| value.data_offset)
            .collect()
    }

    /// File paths, with densities, of a file-based resource such as
    /// `mipmap/ic_launcher`.
    pub fn file_paths(&self, type_name: &str, key: &str) -> Vec<(u16, String)> {
        self.values
            .iter()
            .filter(|value| {
                value.type_name == type_name && value.key == key && value.value_type == TYPE_STRING
            })
            .filter_map(|value| {
                self.global_strings
                    .get(value.data)
                    .map(|path| (value.density, path.to_string()))
            })
            .collect()
    }
}

fn parse_package(chunk: &[u8], chunk_offset: usize, values: &mut Vec<ResourceValue>) -> Result<()> {
    let header_size = u16_at(chunk, 2)? as usize;
    let type_strings_offset = u32_at(chunk, 8 + 4 + 256)? as usize;
    let key_strings_offset = u32_at(chunk, 8 + 4 + 256 + 8)? as usize;
    let type_names = StringPool::parse(
        chunk
            .get(type_strings_offset..)
            .ok_or_else(|| invalid("type names are out of range"))?,
    )?
    .0;
    let key_names = StringPool::parse(
        chunk
            .get(key_strings_offset..)
            .ok_or_else(|| invalid("key names are out of range"))?,
    )?
    .0;

    let mut cursor = header_size;
    while cursor < chunk.len() {
        let chunk_type = u16_at(chunk, cursor)?;
        let size = u32_at(chunk, cursor + 4)? as usize;
        if size < 8 || cursor + size > chunk.len() {
            return Err(invalid("package chunk size is out of range"));
        }
        if chunk_type == RES_TABLE_TYPE_TYPE {
            parse_type(
                &chunk[cursor..cursor + size],
                chunk_offset + cursor,
                &type_names,
                &key_names,
                values,
            )?;
        }
        cursor += size;
    }
    Ok(())
}

fn parse_type(
    chunk: &[u8],
    chunk_offset: usize,
    type_names: &StringPool,
    key_names: &StringPool,
    values: &mut Vec<ResourceValue>,
) -> Result<()> {
    let header_size = u16_at(chunk, 2)? as usize;
    let type_id = u8_at(chunk, 8)?;
    let flags = u8_at(chunk, 9)?;
    let entry_count = u32_at(chunk, 12)? as usize;
    let entries_start = u32_at(chunk, 16)? as usize;
    let density = u16_at(chunk, 20 + CONFIG_DENSITY_OFFSET)?;
    let type_name = type_names
        .get(u32::from(type_id).saturating_sub(1))
        .ok_or_else(|| invalid("type id is out of range"))?
        .to_string();

    let mut entry_offsets = Vec::with_capacity(entry_count);
    for index in 0..entry_count {
        let offset = if flags & FLAG_SPARSE != 0 {
            Some(u16_at(chunk, header_size + index * 4 + 2)? as usize * 4)
        } else if flags & FLAG_OFFSET16 != 0 {
            let raw = u16_at(chunk, header_size + index * 2)?;
            (raw != NO_ENTRY_16).then_some(raw as usize * 4)
        } else {
            let raw = u32_at(chunk, header_size + index * 4)?;
            (raw != NO_ENTRY_32).then_some(raw as usize)
        };
        entry_offsets.extend(offset);
    }

    for offset in entry_offsets {
        let entry = entries_start + offset;
        let entry_flags = u16_at(chunk, entry + 2)?;
        let (key_index, value_type, data_position) = if entry_flags & ENTRY_FLAG_COMPACT != 0 {
            (
                u32::from(u16_at(chunk, entry)?),
                (entry_flags >> 8) as u8,
                entry + 4,
            )
        } else {
            if entry_flags & ENTRY_FLAG_COMPLEX != 0 {
                continue;
            }
            let entry_size = u16_at(chunk, entry)? as usize;
            let value = entry + entry_size;
            (
                u32_at(chunk, entry + 4)?,
                u8_at(chunk, value + 3)?,
                value + 4,
            )
        };
        if data_position + 4 > chunk.len() {
            return Err(invalid("value is outside its type chunk"));
        }
        values.push(ResourceValue {
            type_name: type_name.clone(),
            key: key_names.get(key_index).unwrap_or_default().to_string(),
            density,
            value_type,
            data: u32_at(chunk, data_position)?,
            data_offset: chunk_offset + data_position,
        });
    }
    Ok(())
}

/// Overwrites the 4-byte value at `offset` after checking it still holds
/// `expected`.
pub fn patch_color(bytes: &mut [u8], offset: usize, expected: u32, value: u32) -> Result<()> {
    let current = u32_at(bytes, offset)?;
    if current != expected {
        return Err(ExportError::template(format!(
            "resources.arsc does not hold the reserved template color at offset {offset}."
        )));
    }
    bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
    Ok(())
}
