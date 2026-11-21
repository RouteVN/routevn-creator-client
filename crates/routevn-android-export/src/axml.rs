//! Reader and writer for Android binary XML (`AndroidManifest.xml` inside an
//! APK).
//!
//! Only the string pool is rebuilt. Every other chunk is kept byte for byte,
//! except attribute values the exporter changes in place. Strings are only
//! replaced by value or appended, so string indices used by the element
//! chunks and the resource map stay valid.

use crate::error::{ExportError, Result};

const RES_STRING_POOL_TYPE: u16 = 0x0001;
const RES_XML_TYPE: u16 = 0x0003;
const RES_XML_START_ELEMENT_TYPE: u16 = 0x0102;
const RES_XML_END_ELEMENT_TYPE: u16 = 0x0103;
const RES_XML_RESOURCE_MAP_TYPE: u16 = 0x0180;

const STRING_POOL_HEADER_SIZE: usize = 28;
const UTF8_FLAG: u32 = 1 << 8;
const SORTED_FLAG: u32 = 1 << 0;
const NO_INDEX: u32 = 0xFFFF_FFFF;

pub const TYPE_STRING: u8 = 0x03;
pub const TYPE_INT_DEC: u8 = 0x10;
pub const TYPE_INT_HEX: u8 = 0x11;
pub const TYPE_INT_BOOLEAN: u8 = 0x12;

pub const ATTR_LABEL: u32 = 0x0101_0001;
pub const ATTR_ICON: u32 = 0x0101_0002;
pub const ATTR_NAME: u32 = 0x0101_0003;
pub const ATTR_DEBUGGABLE: u32 = 0x0101_000f;
pub const ATTR_SCREEN_ORIENTATION: u32 = 0x0101_001e;
pub const ATTR_VERSION_CODE: u32 = 0x0101_021b;
pub const ATTR_VERSION_NAME: u32 = 0x0101_021c;
pub const ATTR_MIN_SDK_VERSION: u32 = 0x0101_020c;
pub const ATTR_TARGET_SDK_VERSION: u32 = 0x0101_0270;

pub const SCREEN_ORIENTATION_SENSOR_LANDSCAPE: u32 = 6;
pub const SCREEN_ORIENTATION_SENSOR_PORTRAIT: u32 = 7;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StringPool {
    pub strings: Vec<String>,
    pub utf8: bool,
    flags: u32,
    /// Styled spans are kept only for reading. A pool with styles cannot be
    /// re-encoded.
    has_styles: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Attribute {
    pub name_index: u32,
    pub resource_id: Option<u32>,
    pub raw_value: u32,
    pub value_type: u8,
    pub data: u32,
    /// Offset of this attribute record inside `BinaryXml::body`.
    body_offset: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Element {
    pub name: String,
    /// Names of the enclosing elements, outermost first.
    pub parents: Vec<String>,
    pub attributes: Vec<Attribute>,
}

#[derive(Clone, Debug)]
pub struct BinaryXml {
    pub pool: StringPool,
    resource_ids: Vec<u32>,
    /// Every chunk after the string pool, unchanged except for edited
    /// attribute values.
    body: Vec<u8>,
    pub elements: Vec<Element>,
}

fn invalid(message: impl Into<String>) -> ExportError {
    ExportError::template(format!(
        "Invalid binary AndroidManifest.xml: {}",
        message.into()
    ))
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

impl StringPool {
    pub fn parse(bytes: &[u8]) -> Result<(Self, usize)> {
        if u16_at(bytes, 0)? != RES_STRING_POOL_TYPE {
            return Err(invalid("missing string pool"));
        }
        let header_size = u16_at(bytes, 2)? as usize;
        let chunk_size = u32_at(bytes, 4)? as usize;
        let string_count = u32_at(bytes, 8)? as usize;
        let style_count = u32_at(bytes, 12)?;
        let flags = u32_at(bytes, 16)?;
        let strings_start = u32_at(bytes, 20)? as usize;
        if chunk_size > bytes.len() || header_size < STRING_POOL_HEADER_SIZE {
            return Err(invalid("string pool size is out of range"));
        }
        let utf8 = flags & UTF8_FLAG != 0;
        let mut strings = Vec::with_capacity(string_count);
        for index in 0..string_count {
            let offset = u32_at(bytes, header_size + index * 4)? as usize;
            let start = strings_start + offset;
            if start >= chunk_size {
                return Err(invalid("string offset is out of range"));
            }
            let string = if utf8 {
                decode_utf8_string(&bytes[start..chunk_size])?
            } else {
                decode_utf16_string(&bytes[start..chunk_size])?
            };
            strings.push(string);
        }
        Ok((
            Self {
                strings,
                utf8,
                flags,
                has_styles: style_count != 0,
            },
            chunk_size,
        ))
    }

    pub fn encode(&self) -> Result<Vec<u8>> {
        if self.has_styles {
            return Err(invalid("styled strings are not supported"));
        }
        let mut data = Vec::new();
        let mut offsets = Vec::with_capacity(self.strings.len());
        for string in &self.strings {
            offsets.push(data.len() as u32);
            if self.utf8 {
                encode_utf8_string(string, &mut data)?;
            } else {
                encode_utf16_string(string, &mut data)?;
            }
        }
        while data.len() % 4 != 0 {
            data.push(0);
        }

        let strings_start = STRING_POOL_HEADER_SIZE + offsets.len() * 4;
        let chunk_size = strings_start + data.len();
        let mut chunk = Vec::with_capacity(chunk_size);
        chunk.extend_from_slice(&RES_STRING_POOL_TYPE.to_le_bytes());
        chunk.extend_from_slice(&(STRING_POOL_HEADER_SIZE as u16).to_le_bytes());
        chunk.extend_from_slice(&(chunk_size as u32).to_le_bytes());
        chunk.extend_from_slice(&(offsets.len() as u32).to_le_bytes());
        chunk.extend_from_slice(&0u32.to_le_bytes());
        chunk.extend_from_slice(
            &((self.flags & !SORTED_FLAG) | if self.utf8 { UTF8_FLAG } else { 0 }).to_le_bytes(),
        );
        chunk.extend_from_slice(&(strings_start as u32).to_le_bytes());
        chunk.extend_from_slice(&0u32.to_le_bytes());
        for offset in offsets {
            chunk.extend_from_slice(&offset.to_le_bytes());
        }
        chunk.extend_from_slice(&data);
        Ok(chunk)
    }

    pub fn get(&self, index: u32) -> Option<&str> {
        self.strings.get(index as usize).map(String::as_str)
    }
}

fn decode_length_utf8(bytes: &[u8], cursor: &mut usize) -> Result<usize> {
    let first = *bytes
        .get(*cursor)
        .ok_or_else(|| invalid("truncated string"))? as usize;
    *cursor += 1;
    if first & 0x80 == 0 {
        return Ok(first);
    }
    let second = *bytes
        .get(*cursor)
        .ok_or_else(|| invalid("truncated string"))? as usize;
    *cursor += 1;
    Ok(((first & 0x7F) << 8) | second)
}

fn decode_utf8_string(bytes: &[u8]) -> Result<String> {
    let mut cursor = 0;
    let _utf16_len = decode_length_utf8(bytes, &mut cursor)?;
    let byte_len = decode_length_utf8(bytes, &mut cursor)?;
    let raw = bytes
        .get(cursor..cursor + byte_len)
        .ok_or_else(|| invalid("truncated string"))?;
    String::from_utf8(raw.to_vec()).map_err(|_| invalid("string is not valid UTF-8"))
}

fn decode_utf16_string(bytes: &[u8]) -> Result<String> {
    let mut cursor = 0;
    let first = u16_at(bytes, cursor)? as usize;
    cursor += 2;
    let length = if first & 0x8000 != 0 {
        let second = u16_at(bytes, cursor)? as usize;
        cursor += 2;
        ((first & 0x7FFF) << 16) | second
    } else {
        first
    };
    let mut units = Vec::with_capacity(length);
    for index in 0..length {
        units.push(u16_at(bytes, cursor + index * 2)?);
    }
    String::from_utf16(&units).map_err(|_| invalid("string is not valid UTF-16"))
}

fn encode_length_utf8(length: usize, output: &mut Vec<u8>) -> Result<()> {
    if length > 0x7FFF {
        return Err(ExportError::invalid_request(
            "A manifest text value is too long.",
        ));
    }
    if length > 0x7F {
        output.push(((length >> 8) as u8) | 0x80);
    }
    output.push((length & 0xFF) as u8);
    Ok(())
}

fn encode_utf8_string(value: &str, output: &mut Vec<u8>) -> Result<()> {
    encode_length_utf8(value.encode_utf16().count(), output)?;
    encode_length_utf8(value.len(), output)?;
    output.extend_from_slice(value.as_bytes());
    output.push(0);
    Ok(())
}

fn encode_utf16_string(value: &str, output: &mut Vec<u8>) -> Result<()> {
    let units: Vec<u16> = value.encode_utf16().collect();
    if units.len() > 0x7FFF {
        return Err(ExportError::invalid_request(
            "A manifest text value is too long.",
        ));
    }
    output.extend_from_slice(&(units.len() as u16).to_le_bytes());
    for unit in units {
        output.extend_from_slice(&unit.to_le_bytes());
    }
    output.extend_from_slice(&0u16.to_le_bytes());
    Ok(())
}

impl BinaryXml {
    pub fn parse(bytes: &[u8]) -> Result<Self> {
        if u16_at(bytes, 0)? != RES_XML_TYPE {
            return Err(invalid("missing XML header"));
        }
        let header_size = u16_at(bytes, 2)? as usize;
        let total_size = u32_at(bytes, 4)? as usize;
        if total_size != bytes.len() {
            return Err(invalid("document size does not match its header"));
        }
        let (pool, pool_size) = StringPool::parse(&bytes[header_size..])?;
        let body = bytes[header_size + pool_size..].to_vec();

        let mut resource_ids = Vec::new();
        let mut elements = Vec::new();
        let mut stack: Vec<String> = Vec::new();
        let mut cursor = 0usize;
        while cursor < body.len() {
            let chunk_type = u16_at(&body, cursor)?;
            let chunk_header_size = u16_at(&body, cursor + 2)? as usize;
            let chunk_size = u32_at(&body, cursor + 4)? as usize;
            if chunk_size < 8 || cursor + chunk_size > body.len() {
                return Err(invalid("chunk size is out of range"));
            }
            match chunk_type {
                RES_XML_RESOURCE_MAP_TYPE => {
                    let count = (chunk_size - chunk_header_size) / 4;
                    for index in 0..count {
                        resource_ids.push(u32_at(&body, cursor + chunk_header_size + index * 4)?);
                    }
                }
                RES_XML_START_ELEMENT_TYPE => {
                    let ext = cursor + chunk_header_size;
                    let name_index = u32_at(&body, ext + 4)?;
                    let attribute_start = u16_at(&body, ext + 8)? as usize;
                    let attribute_size = u16_at(&body, ext + 10)? as usize;
                    let attribute_count = u16_at(&body, ext + 12)? as usize;
                    if attribute_size < 20 {
                        return Err(invalid("attribute records are too small"));
                    }
                    let name = pool
                        .get(name_index)
                        .ok_or_else(|| invalid("element name index is out of range"))?
                        .to_string();
                    let mut attributes = Vec::with_capacity(attribute_count);
                    for index in 0..attribute_count {
                        let offset = ext + attribute_start + index * attribute_size;
                        if offset + 20 > cursor + chunk_size {
                            return Err(invalid("attribute is outside its element"));
                        }
                        let attribute_name = u32_at(&body, offset + 4)?;
                        attributes.push(Attribute {
                            name_index: attribute_name,
                            resource_id: resource_ids.get(attribute_name as usize).copied(),
                            raw_value: u32_at(&body, offset + 8)?,
                            value_type: body[offset + 15],
                            data: u32_at(&body, offset + 16)?,
                            body_offset: offset,
                        });
                    }
                    elements.push(Element {
                        name: name.clone(),
                        parents: stack.clone(),
                        attributes,
                    });
                    stack.push(name);
                }
                RES_XML_END_ELEMENT_TYPE => {
                    stack.pop();
                }
                _ => {}
            }
            cursor += chunk_size;
        }

        Ok(Self {
            pool,
            resource_ids,
            body,
            elements,
        })
    }

    pub fn encode(&self) -> Result<Vec<u8>> {
        let pool = self.pool.encode()?;
        let total = 8 + pool.len() + self.body.len();
        let mut bytes = Vec::with_capacity(total);
        bytes.extend_from_slice(&RES_XML_TYPE.to_le_bytes());
        bytes.extend_from_slice(&8u16.to_le_bytes());
        bytes.extend_from_slice(&(total as u32).to_le_bytes());
        bytes.extend_from_slice(&pool);
        bytes.extend_from_slice(&self.body);
        Ok(bytes)
    }

    pub fn attribute_name(&self, attribute: &Attribute) -> &str {
        self.pool.get(attribute.name_index).unwrap_or_default()
    }

    /// Returns the string value of an attribute stored as text.
    pub fn attribute_string(&self, attribute: &Attribute) -> Option<&str> {
        if attribute.value_type == TYPE_STRING {
            return self.pool.get(attribute.data);
        }
        if attribute.raw_value != NO_INDEX {
            return self.pool.get(attribute.raw_value);
        }
        None
    }

    pub fn find_elements<'a>(&'a self, name: &'a str) -> impl Iterator<Item = &'a Element> + 'a {
        self.elements
            .iter()
            .filter(move |element| element.name == name)
    }

    pub fn root(&self) -> Option<&Element> {
        self.elements.first()
    }

    /// Finds an attribute by Android resource id, or by plain name for
    /// attributes without a namespace such as `package`.
    pub fn find_attribute<'a>(
        &'a self,
        element: &'a Element,
        resource_id: Option<u32>,
        name: &str,
    ) -> Option<&'a Attribute> {
        element
            .attributes
            .iter()
            .find(|attribute| match resource_id {
                Some(id) => attribute.resource_id == Some(id),
                None => attribute.resource_id.is_none() && self.attribute_name(attribute) == name,
            })
    }

    /// Replaces every pool string for which `replace` returns a value.
    /// Returns how many strings changed.
    pub fn replace_strings(&mut self, mut replace: impl FnMut(&str) -> Option<String>) -> usize {
        let mut changed = 0;
        for index in self.resource_ids.len()..self.pool.strings.len() {
            if let Some(next) = replace(&self.pool.strings[index]) {
                self.pool.strings[index] = next;
                changed += 1;
            }
        }
        changed
    }

    /// Points `attribute` at a newly appended string.
    pub fn set_string(&mut self, attribute: &Attribute, value: &str) -> Result<()> {
        let index = self.pool.strings.len() as u32;
        self.pool.strings.push(value.to_string());
        self.write_attribute(attribute, index, TYPE_STRING, index);
        Ok(())
    }

    /// Sets an integer value, keeping the attribute's integer type.
    pub fn set_integer(&mut self, attribute: &Attribute, value: u32) -> Result<()> {
        if !matches!(attribute.value_type, TYPE_INT_DEC | TYPE_INT_HEX) {
            return Err(invalid("attribute is not an integer"));
        }
        self.write_attribute(attribute, NO_INDEX, attribute.value_type, value);
        Ok(())
    }

    fn write_attribute(
        &mut self,
        attribute: &Attribute,
        raw_value: u32,
        value_type: u8,
        data: u32,
    ) {
        let offset = attribute.body_offset;
        self.body[offset + 8..offset + 12].copy_from_slice(&raw_value.to_le_bytes());
        self.body[offset + 15] = value_type;
        self.body[offset + 16..offset + 20].copy_from_slice(&data.to_le_bytes());
        for element in &mut self.elements {
            for candidate in &mut element.attributes {
                if candidate.body_offset == offset {
                    candidate.raw_value = raw_value;
                    candidate.value_type = value_type;
                    candidate.data = data;
                }
            }
        }
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// Builds a small binary manifest the way aapt2 lays it out, for tests.
    pub(crate) fn sample_manifest(utf8: bool) -> Vec<u8> {
        // String pool: resource-mapped attribute names first.
        let strings: Vec<String> = [
            "versionCode",
            "versionName",
            "label",
            "screenOrientation",
            "android",
            "http://schemas.android.com/apk/res/android",
            "package",
            "manifest",
            "application",
            "activity",
            "permission",
            "name",
            "vn.routevn.androidplayer.template",
            "1.0.0",
            "RouteVN Player Template",
            "vn.routevn.androidplayer.template.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION",
            "vn.routevn.androidplayer.PlayerActivity",
        ]
        .iter()
        .map(|value| value.to_string())
        .collect();
        let pool = StringPool {
            strings,
            utf8,
            flags: 0,
            has_styles: false,
        }
        .encode()
        .unwrap();
        let resource_ids = [
            ATTR_VERSION_CODE,
            ATTR_VERSION_NAME,
            ATTR_LABEL,
            ATTR_SCREEN_ORIENTATION,
        ];
        let android_ns = 5u32;

        let mut body = Vec::new();
        let mut resource_map = Vec::new();
        resource_map.extend_from_slice(&RES_XML_RESOURCE_MAP_TYPE.to_le_bytes());
        resource_map.extend_from_slice(&8u16.to_le_bytes());
        resource_map.extend_from_slice(&((8 + resource_ids.len() * 4) as u32).to_le_bytes());
        for id in resource_ids {
            resource_map.extend_from_slice(&id.to_le_bytes());
        }
        body.extend_from_slice(&resource_map);

        let attribute = |ns: u32, name: u32, raw: u32, value_type: u8, data: u32| {
            let mut bytes = Vec::new();
            bytes.extend_from_slice(&ns.to_le_bytes());
            bytes.extend_from_slice(&name.to_le_bytes());
            bytes.extend_from_slice(&raw.to_le_bytes());
            bytes.extend_from_slice(&8u16.to_le_bytes());
            bytes.push(0);
            bytes.push(value_type);
            bytes.extend_from_slice(&data.to_le_bytes());
            bytes
        };
        let start_element = |name: u32, attributes: Vec<Vec<u8>>| {
            let mut ext = Vec::new();
            ext.extend_from_slice(&NO_INDEX.to_le_bytes());
            ext.extend_from_slice(&name.to_le_bytes());
            ext.extend_from_slice(&20u16.to_le_bytes());
            ext.extend_from_slice(&20u16.to_le_bytes());
            ext.extend_from_slice(&(attributes.len() as u16).to_le_bytes());
            ext.extend_from_slice(&0u16.to_le_bytes());
            ext.extend_from_slice(&0u16.to_le_bytes());
            ext.extend_from_slice(&0u16.to_le_bytes());
            for attribute in attributes {
                ext.extend_from_slice(&attribute);
            }
            let mut chunk = Vec::new();
            chunk.extend_from_slice(&RES_XML_START_ELEMENT_TYPE.to_le_bytes());
            chunk.extend_from_slice(&16u16.to_le_bytes());
            chunk.extend_from_slice(&((16 + ext.len()) as u32).to_le_bytes());
            chunk.extend_from_slice(&1u32.to_le_bytes());
            chunk.extend_from_slice(&NO_INDEX.to_le_bytes());
            chunk.extend_from_slice(&ext);
            chunk
        };
        let end_element = |name: u32| {
            let mut chunk = Vec::new();
            chunk.extend_from_slice(&RES_XML_END_ELEMENT_TYPE.to_le_bytes());
            chunk.extend_from_slice(&16u16.to_le_bytes());
            chunk.extend_from_slice(&24u32.to_le_bytes());
            chunk.extend_from_slice(&1u32.to_le_bytes());
            chunk.extend_from_slice(&NO_INDEX.to_le_bytes());
            chunk.extend_from_slice(&NO_INDEX.to_le_bytes());
            chunk.extend_from_slice(&name.to_le_bytes());
            chunk
        };

        body.extend_from_slice(&start_element(
            7,
            vec![
                attribute(android_ns, 0, NO_INDEX, TYPE_INT_DEC, 1),
                attribute(android_ns, 1, 13, TYPE_STRING, 13),
                attribute(NO_INDEX, 6, 12, TYPE_STRING, 12),
            ],
        ));
        body.extend_from_slice(&start_element(
            10,
            vec![attribute(android_ns, 11, 15, TYPE_STRING, 15)],
        ));
        body.extend_from_slice(&end_element(10));
        body.extend_from_slice(&start_element(
            8,
            vec![attribute(android_ns, 2, 14, TYPE_STRING, 14)],
        ));
        body.extend_from_slice(&start_element(
            9,
            vec![
                attribute(android_ns, 11, 16, TYPE_STRING, 16),
                attribute(
                    android_ns,
                    3,
                    NO_INDEX,
                    TYPE_INT_DEC,
                    SCREEN_ORIENTATION_SENSOR_LANDSCAPE,
                ),
            ],
        ));
        body.extend_from_slice(&end_element(9));
        body.extend_from_slice(&end_element(8));
        body.extend_from_slice(&end_element(7));

        let total = 8 + pool.len() + body.len();
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&RES_XML_TYPE.to_le_bytes());
        bytes.extend_from_slice(&8u16.to_le_bytes());
        bytes.extend_from_slice(&(total as u32).to_le_bytes());
        bytes.extend_from_slice(&pool);
        bytes.extend_from_slice(&body);
        bytes
    }

    #[test]
    fn round_trips_unchanged_documents() {
        for utf8 in [true, false] {
            let bytes = sample_manifest(utf8);
            let document = BinaryXml::parse(&bytes).unwrap();
            assert_eq!(document.encode().unwrap(), bytes);
            assert_eq!(document.elements.len(), 4);
            assert_eq!(
                document.elements[3].parents,
                vec!["manifest", "application"]
            );
        }
    }

    #[test]
    fn edits_strings_and_attributes() {
        for utf8 in [true, false] {
            let mut document = BinaryXml::parse(&sample_manifest(utf8)).unwrap();
            let template = "vn.routevn.androidplayer.template";
            let changed = document.replace_strings(|value| {
                if value == template {
                    return Some("com.example.game".to_string());
                }
                value
                    .strip_prefix(&format!("{template}."))
                    .map(|rest| format!("com.example.game.{rest}"))
            });
            assert_eq!(changed, 2);

            let manifest = document.root().unwrap().clone();
            let version_code = document
                .find_attribute(&manifest, Some(ATTR_VERSION_CODE), "")
                .unwrap()
                .clone();
            let version_name = document
                .find_attribute(&manifest, Some(ATTR_VERSION_NAME), "")
                .unwrap()
                .clone();
            document.set_integer(&version_code, 42).unwrap();
            document.set_string(&version_name, "2.3.4").unwrap();
            let application = document
                .find_elements("application")
                .next()
                .unwrap()
                .clone();
            let label = document
                .find_attribute(&application, Some(ATTR_LABEL), "")
                .unwrap()
                .clone();
            document.set_string(&label, "日本語のゲーム").unwrap();
            let activity = document.find_elements("activity").next().unwrap().clone();
            let orientation = document
                .find_attribute(&activity, Some(ATTR_SCREEN_ORIENTATION), "")
                .unwrap()
                .clone();
            document
                .set_integer(&orientation, SCREEN_ORIENTATION_SENSOR_PORTRAIT)
                .unwrap();

            let reparsed = BinaryXml::parse(&document.encode().unwrap()).unwrap();
            let root = reparsed.root().unwrap();
            assert_eq!(
                reparsed.attribute_string(reparsed.find_attribute(root, None, "package").unwrap()),
                Some("com.example.game")
            );
            assert_eq!(
                reparsed
                    .find_attribute(root, Some(ATTR_VERSION_CODE), "")
                    .unwrap()
                    .data,
                42
            );
            assert_eq!(
                reparsed.attribute_string(
                    reparsed
                        .find_attribute(root, Some(ATTR_VERSION_NAME), "")
                        .unwrap()
                ),
                Some("2.3.4")
            );
            let application = reparsed.find_elements("application").next().unwrap();
            assert_eq!(
                reparsed.attribute_string(
                    reparsed
                        .find_attribute(application, Some(ATTR_LABEL), "")
                        .unwrap()
                ),
                Some("日本語のゲーム")
            );
            let permission = reparsed.find_elements("permission").next().unwrap();
            assert_eq!(
                reparsed.attribute_string(&permission.attributes[0]),
                Some("com.example.game.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION")
            );
            let activity = reparsed.find_elements("activity").next().unwrap();
            assert_eq!(
                reparsed.attribute_string(&activity.attributes[0]),
                Some("vn.routevn.androidplayer.PlayerActivity")
            );
            assert_eq!(
                reparsed
                    .find_attribute(activity, Some(ATTR_SCREEN_ORIENTATION), "")
                    .unwrap()
                    .data,
                SCREEN_ORIENTATION_SENSOR_PORTRAIT
            );
            assert!(
                !reparsed
                    .pool
                    .strings
                    .iter()
                    .any(|value| value.contains(template))
            );
        }
    }

    #[test]
    fn rejects_overlong_values() {
        let mut document = BinaryXml::parse(&sample_manifest(true)).unwrap();
        let manifest = document.root().unwrap().clone();
        let version_name = document
            .find_attribute(&manifest, Some(ATTR_VERSION_NAME), "")
            .unwrap()
            .clone();
        document
            .set_string(&version_name, &"x".repeat(40_000))
            .unwrap();
        assert!(document.encode().is_err());
    }
}
