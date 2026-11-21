//! The app bundle's `resources.pb`, an aapt2 protocol buffer
//! `ResourceTable` (`frameworks/base/tools/aapt2/Resources.proto`).

use crate::error::Result;
use crate::protobuf::{Message, Value};

// ResourceTable
const TABLE_PACKAGE: u32 = 2;
// Package
const PACKAGE_NAME: u32 = 2;
const PACKAGE_TYPE: u32 = 3;
// Type
const TYPE_NAME: u32 = 2;
const TYPE_ENTRY: u32 = 3;
// Entry
const ENTRY_NAME: u32 = 2;
const ENTRY_CONFIG_VALUE: u32 = 6;
// ConfigValue
const CONFIG_VALUE_CONFIG: u32 = 1;
const CONFIG_VALUE_VALUE: u32 = 2;
// Configuration
const CONFIGURATION_DENSITY: u32 = 18;
// Value
const VALUE_ITEM: u32 = 4;
// Item
const ITEM_FILE: u32 = 5;
const ITEM_PRIMITIVE: u32 = 7;
// FileReference
const FILE_PATH: u32 = 1;
// Primitive
const PRIMITIVE_COLOR_ARGB8: u32 = 9;

pub struct ResourceTable {
    table: Message,
}

/// One value of a resource entry.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResourceValue {
    pub type_name: String,
    pub key: String,
    pub density: u32,
    pub file_path: Option<String>,
    pub color: Option<u32>,
}

fn decode_item(item: &Message) -> Result<(Option<String>, Option<u32>)> {
    let file_path = item
        .message(ITEM_FILE)?
        .map(|file| file.string(FILE_PATH).map(|path| path.map(str::to_string)))
        .transpose()?
        .flatten();
    let color = item
        .message(ITEM_PRIMITIVE)?
        .and_then(|primitive| primitive.varint(PRIMITIVE_COLOR_ARGB8))
        .map(|value| value as u32);
    Ok((file_path, color))
}

impl ResourceTable {
    pub fn parse(bytes: &[u8]) -> Result<Self> {
        Ok(Self {
            table: Message::parse(bytes)?,
        })
    }

    pub fn encode(&self) -> Vec<u8> {
        self.table.encode()
    }

    pub fn package_names(&self) -> Result<Vec<String>> {
        self.table
            .messages(TABLE_PACKAGE)?
            .iter()
            .map(|package| {
                package
                    .string(PACKAGE_NAME)
                    .map(|name| name.unwrap_or_default().to_string())
            })
            .collect()
    }

    /// Every item value in the table.
    pub fn values(&self) -> Result<Vec<ResourceValue>> {
        let mut values = Vec::new();
        for package in self.table.messages(TABLE_PACKAGE)? {
            for resource_type in package.messages(PACKAGE_TYPE)? {
                let type_name = resource_type.string(TYPE_NAME)?.unwrap_or_default();
                for entry in resource_type.messages(TYPE_ENTRY)? {
                    let key = entry.string(ENTRY_NAME)?.unwrap_or_default();
                    for config_value in entry.messages(ENTRY_CONFIG_VALUE)? {
                        let density = config_value
                            .message(CONFIG_VALUE_CONFIG)?
                            .and_then(|config| config.varint(CONFIGURATION_DENSITY))
                            .map_or(0, |density| density as u32);
                        let Some(item) = config_value
                            .message(CONFIG_VALUE_VALUE)?
                            .map(|value| value.message(VALUE_ITEM))
                            .transpose()?
                            .flatten()
                        else {
                            continue;
                        };
                        let (file_path, color) = decode_item(&item)?;
                        values.push(ResourceValue {
                            type_name: type_name.to_string(),
                            key: key.to_string(),
                            density,
                            file_path,
                            color,
                        });
                    }
                }
            }
        }
        Ok(values)
    }

    /// How many `color` resources hold `argb`.
    pub fn color_count(&self, argb: u32) -> Result<usize> {
        Ok(self
            .values()?
            .iter()
            .filter(|value| value.type_name == "color" && value.color == Some(argb))
            .count())
    }

    /// File paths, with densities, of a file-based resource such as
    /// `mipmap/ic_launcher`.
    pub fn file_paths(&self, type_name: &str, key: &str) -> Result<Vec<(u32, String)>> {
        Ok(self
            .values()?
            .into_iter()
            .filter(|value| value.type_name == type_name && value.key == key)
            .filter_map(|value| value.file_path.map(|path| (value.density, path)))
            .collect())
    }

    /// Renames the resource packages called `from`. Returns how many were.
    pub fn rename_package(&mut self, from: &str, to: &str) -> Result<usize> {
        let mut renamed = 0;
        self.table.edit_messages(TABLE_PACKAGE, &mut |package| {
            if package.string(PACKAGE_NAME)? == Some(from) {
                package.set_string(PACKAGE_NAME, to);
                renamed += 1;
            }
            Ok(())
        })?;
        Ok(renamed)
    }

    /// Replaces each `color` resource holding a `from` value of
    /// `replacements` with its `to` value, in one pass, so a new value is
    /// never replaced again. Returns how many each replacement changed.
    pub fn replace_colors(&mut self, replacements: &[(u32, u32)]) -> Result<Vec<usize>> {
        let mut replaced = vec![0; replacements.len()];
        self.table.edit_messages(TABLE_PACKAGE, &mut |package| {
            package.edit_messages(PACKAGE_TYPE, &mut |resource_type| {
                if resource_type.string(TYPE_NAME)? != Some("color") {
                    return Ok(());
                }
                resource_type.edit_messages(TYPE_ENTRY, &mut |entry| {
                    entry.edit_messages(ENTRY_CONFIG_VALUE, &mut |config_value| {
                        config_value.edit_messages(CONFIG_VALUE_VALUE, &mut |value| {
                            value.edit_messages(VALUE_ITEM, &mut |item| {
                                item.edit_messages(ITEM_PRIMITIVE, &mut |primitive| {
                                    let value = primitive.varint(PRIMITIVE_COLOR_ARGB8);
                                    if let Some(position) = replacements
                                        .iter()
                                        .position(|(from, _)| value == Some(u64::from(*from)))
                                    {
                                        let to = replacements[position].1;
                                        primitive.set(
                                            PRIMITIVE_COLOR_ARGB8,
                                            Value::Varint(u64::from(to)),
                                        );
                                        replaced[position] += 1;
                                    }
                                    Ok(())
                                })
                            })
                        })
                    })
                })
            })
        })?;
        Ok(replaced)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nest(number: u32, inner: Message) -> Message {
        let mut message = Message::default();
        message.set_message(number, &inner);
        message
    }

    fn table() -> ResourceTable {
        let mut primitive = Message::default();
        primitive.set(PRIMITIVE_COLOR_ARGB8, Value::Varint(0xFF13_579B));
        let color_value = nest(VALUE_ITEM, nest(ITEM_PRIMITIVE, primitive));
        let mut color_entry = Message::default();
        color_entry.set_string(ENTRY_NAME, "icon_background");
        color_entry.set_message(ENTRY_CONFIG_VALUE, &nest(CONFIG_VALUE_VALUE, color_value));
        let mut color_type = Message::default();
        color_type.set_string(TYPE_NAME, "color");
        color_type.set_message(TYPE_ENTRY, &color_entry);

        let mut file = Message::default();
        file.set_string(FILE_PATH, "res/mipmap-hdpi-v4/ic_launcher.png");
        let mut config = Message::default();
        config.set(CONFIGURATION_DENSITY, Value::Varint(240));
        let mut config_value = nest(CONFIG_VALUE_VALUE, nest(VALUE_ITEM, nest(ITEM_FILE, file)));
        config_value.set_message(CONFIG_VALUE_CONFIG, &config);
        let mut icon_entry = Message::default();
        icon_entry.set_string(ENTRY_NAME, "ic_launcher");
        icon_entry.set_message(ENTRY_CONFIG_VALUE, &config_value);
        let mut mipmap_type = Message::default();
        mipmap_type.set_string(TYPE_NAME, "mipmap");
        mipmap_type.set_message(TYPE_ENTRY, &icon_entry);

        let mut package = Message::default();
        package.set_string(PACKAGE_NAME, "com.example.template");
        package.fields.push(crate::protobuf::Field {
            number: PACKAGE_TYPE,
            value: Value::Bytes(color_type.encode()),
        });
        package.fields.push(crate::protobuf::Field {
            number: PACKAGE_TYPE,
            value: Value::Bytes(mipmap_type.encode()),
        });
        ResourceTable::parse(&nest(TABLE_PACKAGE, package).encode()).unwrap()
    }

    #[test]
    fn reads_colors_and_file_paths() {
        let table = table();
        assert_eq!(table.package_names().unwrap(), ["com.example.template"]);
        assert_eq!(table.color_count(0xFF13_579B).unwrap(), 1);
        assert_eq!(
            table.file_paths("mipmap", "ic_launcher").unwrap(),
            [(240, "res/mipmap-hdpi-v4/ic_launcher.png".to_string())]
        );
    }

    #[test]
    fn renames_the_package_and_replaces_colors() {
        let mut table = table();
        // The first new value is the second old one, and is not replaced again.
        assert_eq!(
            table
                .replace_colors(&[(0xFF13_579B, 0xFF24_68AC), (0xFF24_68AC, 0xFF00_0000)])
                .unwrap(),
            [1, 0]
        );
        assert_eq!(table.color_count(0xFF24_68AC).unwrap(), 1);
        assert_eq!(
            table.replace_colors(&[(0xFF24_68AC, 0xFF00_0000)]).unwrap(),
            [1]
        );
        assert_eq!(
            table
                .rename_package("com.example.template", "com.example.game")
                .unwrap(),
            1
        );
        let table = ResourceTable::parse(&table.encode()).unwrap();
        assert_eq!(table.package_names().unwrap(), ["com.example.game"]);
        assert_eq!(table.color_count(0xFF00_0000).unwrap(), 1);
        assert_eq!(table.file_paths("mipmap", "ic_launcher").unwrap().len(), 1);
    }
}
