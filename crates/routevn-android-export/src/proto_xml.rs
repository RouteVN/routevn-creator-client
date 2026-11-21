//! The app bundle's `AndroidManifest.xml`, which aapt2 stores as a protocol
//! buffer `XmlNode` (`frameworks/base/tools/aapt2/Resources.proto`) instead
//! of binary XML.

use crate::axml;
use crate::error::{ExportError, Result};
use crate::protobuf::{Message, Value};
use crate::template::ManifestFacts;

// XmlNode
const NODE_ELEMENT: u32 = 1;
// XmlElement
const ELEMENT_NAME: u32 = 3;
const ELEMENT_ATTRIBUTE: u32 = 4;
const ELEMENT_CHILD: u32 = 5;
// XmlAttribute
const ATTRIBUTE_NAMESPACE_URI: u32 = 1;
const ATTRIBUTE_NAME: u32 = 2;
const ATTRIBUTE_VALUE: u32 = 3;
const ATTRIBUTE_RESOURCE_ID: u32 = 5;
const ATTRIBUTE_COMPILED_ITEM: u32 = 6;
// Item
const ITEM_REFERENCE: u32 = 1;
const ITEM_STRING: u32 = 2;
const ITEM_PRIMITIVE: u32 = 7;
// String
const STRING_VALUE: u32 = 1;
// Primitive
const PRIMITIVE_INT_DECIMAL: u32 = 6;
const PRIMITIVE_INT_HEXADECIMAL: u32 = 7;
const PRIMITIVE_BOOLEAN: u32 = 8;

/// Nesting deeper than any manifest needs; guards the recursive walk.
const MAX_DEPTH: usize = 64;

/// What aapt2 compiled an attribute value to.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Compiled {
    /// Kept as text only.
    None,
    String(String),
    Integer(i64),
    Boolean(bool),
    Reference,
    Other,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Attribute {
    pub namespace_uri: String,
    pub name: String,
    /// The value as written in the source XML.
    pub value: String,
    pub resource_id: u32,
    pub compiled: Compiled,
}

impl Attribute {
    /// The value as a number, from its compiled form when it has one.
    pub fn integer(&self) -> Option<i64> {
        match self.compiled {
            Compiled::Integer(value) => Some(value),
            Compiled::Boolean(value) => Some(i64::from(value)),
            Compiled::None => self.value.parse().ok(),
            _ => None,
        }
    }

    /// The value as a literal string; `None` for references and numbers.
    pub fn string(&self) -> Option<&str> {
        match &self.compiled {
            Compiled::String(value) => Some(value),
            Compiled::None => Some(&self.value),
            _ => None,
        }
    }

    /// Sets a literal string, keeping the compiled form a string.
    pub fn set_string(&mut self, value: &str) -> Result<()> {
        match self.compiled {
            Compiled::None => {}
            Compiled::String(_) => self.compiled = Compiled::String(value.to_string()),
            _ => {
                return Err(ExportError::template(format!(
                    "The manifest attribute {} is not a literal string.",
                    self.name
                )));
            }
        }
        self.value = value.to_string();
        Ok(())
    }

    /// Sets a number, with `text` as its source form, such as an enum name.
    pub fn set_integer(&mut self, text: &str, value: i64) -> Result<()> {
        if !matches!(self.compiled, Compiled::Integer(_)) {
            return Err(ExportError::template(format!(
                "The manifest attribute {} is not a number.",
                self.name
            )));
        }
        self.compiled = Compiled::Integer(value);
        self.value = text.to_string();
        Ok(())
    }
}

#[derive(Clone, Debug)]
pub struct Element {
    pub name: String,
    pub attributes: Vec<Attribute>,
}

impl Element {
    pub fn android_attribute(&self, resource_id: u32) -> Option<&Attribute> {
        self.attributes
            .iter()
            .find(|attribute| attribute.resource_id == resource_id)
    }

    pub fn plain_attribute(&self, name: &str) -> Option<&Attribute> {
        self.attributes
            .iter()
            .find(|attribute| attribute.namespace_uri.is_empty() && attribute.name == name)
    }
}

pub struct ProtoXml {
    root: Message,
}

fn decode_attribute(message: &Message) -> Result<Attribute> {
    let compiled = match message.message(ATTRIBUTE_COMPILED_ITEM)? {
        None => Compiled::None,
        Some(item) => decode_item(&item)?,
    };
    Ok(Attribute {
        namespace_uri: message
            .string(ATTRIBUTE_NAMESPACE_URI)?
            .unwrap_or_default()
            .to_string(),
        name: message
            .string(ATTRIBUTE_NAME)?
            .unwrap_or_default()
            .to_string(),
        value: message
            .string(ATTRIBUTE_VALUE)?
            .unwrap_or_default()
            .to_string(),
        resource_id: message
            .varint(ATTRIBUTE_RESOURCE_ID)
            .and_then(|id| u32::try_from(id).ok())
            .unwrap_or_default(),
        compiled,
    })
}

fn decode_item(item: &Message) -> Result<Compiled> {
    if let Some(string) = item.message(ITEM_STRING)? {
        return Ok(Compiled::String(
            string.string(STRING_VALUE)?.unwrap_or_default().to_string(),
        ));
    }
    if item.has(ITEM_REFERENCE) {
        return Ok(Compiled::Reference);
    }
    let Some(primitive) = item.message(ITEM_PRIMITIVE)? else {
        return Ok(Compiled::Other);
    };
    if let Some(value) = primitive.varint(PRIMITIVE_INT_DECIMAL) {
        // int32 values are sign-extended to 64 bits on the wire.
        return Ok(Compiled::Integer(i64::from(value as i32)));
    }
    if let Some(value) = primitive.varint(PRIMITIVE_INT_HEXADECIMAL) {
        return Ok(Compiled::Integer(i64::from(value as u32)));
    }
    if let Some(value) = primitive.varint(PRIMITIVE_BOOLEAN) {
        return Ok(Compiled::Boolean(value != 0));
    }
    Ok(Compiled::Other)
}

/// Writes the fields of `after` that differ from `before` into `message`.
fn encode_attribute(message: &mut Message, before: &Attribute, after: &Attribute) -> Result<()> {
    if after.value != before.value {
        message.set_string(ATTRIBUTE_VALUE, &after.value);
    }
    if after.compiled == before.compiled {
        return Ok(());
    }
    message.edit_messages(ATTRIBUTE_COMPILED_ITEM, &mut |item| {
        match &after.compiled {
            Compiled::String(value) => {
                let mut string = Message::default();
                string.set_string(STRING_VALUE, value);
                item.set_message(ITEM_STRING, &string);
            }
            Compiled::Integer(value) => {
                let mut primitive = Message::default();
                // Encoded as an int32: negative values are sign-extended.
                let value = i32::try_from(*value).map_err(|_| {
                    ExportError::invalid_request("A manifest number is out of range.")
                })?;
                primitive.set(
                    PRIMITIVE_INT_DECIMAL,
                    Value::Varint(i64::from(value) as u64),
                );
                item.set_message(ITEM_PRIMITIVE, &primitive);
            }
            _ => {
                return Err(ExportError::template(
                    "A manifest attribute cannot be changed to that value.",
                ));
            }
        }
        Ok(())
    })
}

fn visit(node: &Message, depth: usize, elements: &mut Vec<Element>) -> Result<()> {
    if depth > MAX_DEPTH {
        return Err(ExportError::template("The manifest is nested too deeply."));
    }
    for element in node.messages(NODE_ELEMENT)? {
        elements.push(Element {
            name: element
                .string(ELEMENT_NAME)?
                .unwrap_or_default()
                .to_string(),
            attributes: element
                .messages(ELEMENT_ATTRIBUTE)?
                .iter()
                .map(decode_attribute)
                .collect::<Result<_>>()?,
        });
        for child in element.messages(ELEMENT_CHILD)? {
            visit(&child, depth + 1, elements)?;
        }
    }
    Ok(())
}

type AttributeEdit<'a> = dyn FnMut(&str, &mut Attribute) -> Result<()> + 'a;

fn edit(node: &mut Message, depth: usize, change: &mut AttributeEdit<'_>) -> Result<()> {
    if depth > MAX_DEPTH {
        return Err(ExportError::template("The manifest is nested too deeply."));
    }
    node.edit_messages(NODE_ELEMENT, &mut |element| {
        let name = element
            .string(ELEMENT_NAME)?
            .unwrap_or_default()
            .to_string();
        element.edit_messages(ELEMENT_ATTRIBUTE, &mut |message| {
            let before = decode_attribute(message)?;
            let mut after = before.clone();
            change(&name, &mut after)?;
            if after.namespace_uri != before.namespace_uri
                || after.name != before.name
                || after.resource_id != before.resource_id
            {
                return Err(ExportError::template(
                    "A manifest attribute cannot be renamed.",
                ));
            }
            encode_attribute(message, &before, &after)
        })?;
        element.edit_messages(ELEMENT_CHILD, &mut |child| edit(child, depth + 1, change))
    })
}

impl ProtoXml {
    pub fn parse(bytes: &[u8]) -> Result<Self> {
        let root = Message::parse(bytes)?;
        if root.messages(NODE_ELEMENT)?.len() != 1 {
            return Err(ExportError::template(
                "The manifest must have one root element.",
            ));
        }
        Ok(Self { root })
    }

    pub fn encode(&self) -> Vec<u8> {
        self.root.encode()
    }

    /// Every element in document order, the root first.
    pub fn elements(&self) -> Result<Vec<Element>> {
        let mut elements = Vec::new();
        visit(&self.root, 0, &mut elements)?;
        Ok(elements)
    }

    /// Calls `change` with each element name and attribute, in document
    /// order, and stores the attributes it changes.
    pub fn edit_attributes(&mut self, change: &mut AttributeEdit<'_>) -> Result<()> {
        edit(&mut self.root, 0, change)
    }
}

/// Reads the same facts as [`crate::template::manifest_facts`] does from
/// binary XML.
pub fn manifest_facts(document: &ProtoXml) -> Result<ManifestFacts> {
    let invalid = |message: &str| ExportError::template(format!("AndroidManifest.xml: {message}"));
    let elements = document.elements()?;
    let root = elements
        .first()
        .filter(|element| element.name == "manifest")
        .ok_or_else(|| invalid("missing <manifest>"))?;
    let package = root
        .plain_attribute("package")
        .and_then(Attribute::string)
        .ok_or_else(|| invalid("missing package"))?
        .to_string();
    let version_code = root
        .android_attribute(axml::ATTR_VERSION_CODE)
        .and_then(Attribute::integer)
        .and_then(|value| u32::try_from(value).ok())
        .ok_or_else(|| invalid("missing versionCode"))?;
    let version_name = root
        .android_attribute(axml::ATTR_VERSION_NAME)
        .and_then(Attribute::string)
        .ok_or_else(|| invalid("missing versionName"))?
        .to_string();

    let named = |name: &'static str| elements.iter().filter(move |element| element.name == name);
    let uses_sdk = named("uses-sdk").next();
    let sdk = |id| {
        uses_sdk
            .and_then(|element| element.android_attribute(id))
            .and_then(Attribute::integer)
            .and_then(|value| u32::try_from(value).ok())
            .unwrap_or_default()
    };

    let mut applications = named("application");
    let application = applications
        .next()
        .ok_or_else(|| invalid("missing <application>"))?;
    if applications.next().is_some() {
        return Err(invalid("more than one <application>"));
    }
    let label = application
        .android_attribute(axml::ATTR_LABEL)
        .ok_or_else(|| invalid("missing application label"))?
        .string()
        .ok_or_else(|| invalid("the application label must be a literal string"))?
        .to_string();
    let debuggable = application
        .android_attribute(axml::ATTR_DEBUGGABLE)
        .and_then(Attribute::integer)
        .is_some_and(|value| value != 0);

    let activities: Vec<_> = named("activity").chain(named("activity-alias")).collect();
    if activities.len() != 1 {
        return Err(invalid("the template must declare exactly one activity"));
    }
    let orientation = activities[0]
        .android_attribute(axml::ATTR_SCREEN_ORIENTATION)
        .and_then(Attribute::integer)
        .and_then(|value| u32::try_from(value).ok())
        .ok_or_else(|| invalid("the activity has no screenOrientation"))?;

    let name_of = |element: &Element| {
        element
            .android_attribute(axml::ATTR_NAME)
            .and_then(Attribute::string)
            .unwrap_or_default()
            .to_string()
    };
    let components = ["provider", "service", "receiver"]
        .iter()
        .flat_map(|kind| named(kind))
        .map(name_of)
        .collect();
    let permissions = ["permission", "uses-permission", "uses-permission-sdk-23"]
        .iter()
        .flat_map(|kind| named(kind))
        .map(name_of)
        .collect();

    Ok(ManifestFacts {
        package,
        version_code,
        version_name,
        label,
        min_sdk: sdk(axml::ATTR_MIN_SDK_VERSION),
        target_sdk: sdk(axml::ATTR_TARGET_SDK_VERSION),
        debuggable,
        orientation,
        components,
        permissions,
    })
}

/// Every string value in the manifest: attribute text and compiled strings.
pub fn strings(document: &ProtoXml) -> Result<Vec<String>> {
    let mut values = Vec::new();
    for element in document.elements()? {
        for attribute in element.attributes {
            if let Compiled::String(compiled) = attribute.compiled {
                values.push(compiled);
            }
            values.push(attribute.value);
        }
    }
    Ok(values)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn attribute(name: &str, resource_id: u32, value: &str, item: Option<Message>) -> Message {
        let mut message = Message::default();
        if resource_id != 0 {
            message.set_string(
                ATTRIBUTE_NAMESPACE_URI,
                "http://schemas.android.com/apk/res/android",
            );
        }
        message.set_string(ATTRIBUTE_NAME, name);
        message.set_string(ATTRIBUTE_VALUE, value);
        if resource_id != 0 {
            message.set(ATTRIBUTE_RESOURCE_ID, Value::Varint(u64::from(resource_id)));
        }
        if let Some(item) = item {
            message.set_message(ATTRIBUTE_COMPILED_ITEM, &item);
        }
        message
    }

    fn integer_item(value: i64) -> Message {
        let mut primitive = Message::default();
        primitive.set(PRIMITIVE_INT_DECIMAL, Value::Varint(value as u64));
        let mut item = Message::default();
        item.set_message(ITEM_PRIMITIVE, &primitive);
        item
    }

    fn element(name: &str, attributes: Vec<Message>, children: Vec<Message>) -> Message {
        let mut element = Message::default();
        element.set_string(ELEMENT_NAME, name);
        for attribute in attributes {
            element.fields.push(crate::protobuf::Field {
                number: ELEMENT_ATTRIBUTE,
                value: Value::Bytes(attribute.encode()),
            });
        }
        for child in children {
            let mut node = Message::default();
            node.set_message(NODE_ELEMENT, &child);
            element.fields.push(crate::protobuf::Field {
                number: ELEMENT_CHILD,
                value: Value::Bytes(node.encode()),
            });
        }
        element
    }

    fn manifest() -> ProtoXml {
        let activity = element(
            "activity",
            vec![attribute(
                "screenOrientation",
                axml::ATTR_SCREEN_ORIENTATION,
                "sensorLandscape",
                Some(integer_item(6)),
            )],
            vec![],
        );
        let application = element(
            "application",
            vec![attribute("label", axml::ATTR_LABEL, "Template", None)],
            vec![activity],
        );
        let uses_sdk = element(
            "uses-sdk",
            vec![
                attribute(
                    "minSdkVersion",
                    axml::ATTR_MIN_SDK_VERSION,
                    "24",
                    Some(integer_item(24)),
                ),
                attribute(
                    "targetSdkVersion",
                    axml::ATTR_TARGET_SDK_VERSION,
                    "37",
                    Some(integer_item(37)),
                ),
            ],
            vec![],
        );
        let root = element(
            "manifest",
            vec![
                attribute("package", 0, "com.example.template", None),
                attribute(
                    "versionCode",
                    axml::ATTR_VERSION_CODE,
                    "1",
                    Some(integer_item(1)),
                ),
                attribute("versionName", axml::ATTR_VERSION_NAME, "1.0.0", None),
            ],
            vec![uses_sdk, application],
        );
        let mut node = Message::default();
        node.set_message(NODE_ELEMENT, &root);
        ProtoXml::parse(&node.encode()).unwrap()
    }

    #[test]
    fn reads_and_edits_manifest_facts() {
        let mut document = manifest();
        let facts = manifest_facts(&document).unwrap();
        assert_eq!(facts.package, "com.example.template");
        assert_eq!(facts.version_code, 1);
        assert_eq!(facts.label, "Template");
        assert_eq!((facts.min_sdk, facts.target_sdk), (24, 37));
        assert_eq!(facts.orientation, 6);
        assert!(!facts.debuggable);

        document
            .edit_attributes(&mut |element, attribute| {
                match (element, attribute.name.as_str()) {
                    ("manifest", "package") => attribute.set_string("com.example.game")?,
                    ("manifest", "versionCode") => {
                        attribute.set_integer("2100000000", 2_100_000_000)?
                    }
                    ("manifest", "versionName") => attribute.set_string("4.5.6")?,
                    ("application", "label") => attribute.set_string("ゲーム")?,
                    ("activity", "screenOrientation") => {
                        attribute.set_integer("sensorPortrait", 7)?;
                    }
                    _ => {}
                }
                Ok(())
            })
            .unwrap();
        let document = ProtoXml::parse(&document.encode()).unwrap();
        let facts = manifest_facts(&document).unwrap();
        assert_eq!(facts.package, "com.example.game");
        assert_eq!(facts.version_code, 2_100_000_000);
        assert_eq!(facts.version_name, "4.5.6");
        assert_eq!(facts.label, "ゲーム");
        assert_eq!(facts.orientation, 7);
        let elements = document.elements().unwrap();
        let activity = elements.iter().find(|e| e.name == "activity").unwrap();
        assert_eq!(activity.attributes[0].value, "sensorPortrait");
    }

    #[test]
    fn refuses_to_change_a_number_into_text() {
        let mut document = manifest();
        let result = document.edit_attributes(&mut |_, attribute| {
            if attribute.name == "versionCode" {
                attribute.set_string("2")?;
            }
            Ok(())
        });
        assert!(result.is_err());
    }
}
