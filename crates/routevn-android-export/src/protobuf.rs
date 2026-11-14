//! Protocol buffer wire format, enough to edit the app bundle's manifest and
//! resource table without their schemas compiled in.
//!
//! A message is kept as its fields in their encoded order. Only the nested
//! messages an edit opens are decoded and encoded again, so fields the
//! exporter does not know, including ones newer build tools add, survive.

use crate::error::{ExportError, Result};

const WIRE_VARINT: u8 = 0;
const WIRE_FIXED64: u8 = 1;
const WIRE_BYTES: u8 = 2;
const WIRE_FIXED32: u8 = 5;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Value {
    Varint(u64),
    Fixed64([u8; 8]),
    Bytes(Vec<u8>),
    Fixed32([u8; 4]),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Field {
    pub number: u32,
    pub value: Value,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Message {
    pub fields: Vec<Field>,
}

fn invalid(message: &str) -> ExportError {
    ExportError::template(format!("Invalid protocol buffer: {message}."))
}

fn read_varint(bytes: &[u8], position: &mut usize) -> Result<u64> {
    let mut value = 0u64;
    for shift in (0..64).step_by(7) {
        let byte = *bytes
            .get(*position)
            .ok_or_else(|| invalid("a number ends early"))?;
        *position += 1;
        if shift == 63 && byte > 1 {
            return Err(invalid("a number is too large"));
        }
        value |= u64::from(byte & 0x7f) << shift;
        if byte < 0x80 {
            return Ok(value);
        }
    }
    Err(invalid("a number is too long"))
}

fn write_varint(output: &mut Vec<u8>, mut value: u64) {
    while value >= 0x80 {
        output.push((value as u8 & 0x7f) | 0x80);
        value >>= 7;
    }
    output.push(value as u8);
}

fn take<'a>(bytes: &'a [u8], position: &mut usize, length: usize) -> Result<&'a [u8]> {
    let end = position
        .checked_add(length)
        .filter(|end| *end <= bytes.len())
        .ok_or_else(|| invalid("a field ends early"))?;
    let slice = &bytes[*position..end];
    *position = end;
    Ok(slice)
}

impl Message {
    pub fn parse(bytes: &[u8]) -> Result<Self> {
        let mut fields = Vec::new();
        let mut position = 0;
        while position < bytes.len() {
            let key = read_varint(bytes, &mut position)?;
            let number = u32::try_from(key >> 3)
                .ok()
                .filter(|number| (1..=0x1fff_ffff).contains(number))
                .ok_or_else(|| invalid("a field number is out of range"))?;
            let value = match (key & 7) as u8 {
                WIRE_VARINT => Value::Varint(read_varint(bytes, &mut position)?),
                WIRE_FIXED64 => Value::Fixed64(take(bytes, &mut position, 8)?.try_into().unwrap()),
                WIRE_BYTES => {
                    let length = usize::try_from(read_varint(bytes, &mut position)?)
                        .map_err(|_| invalid("a field is too long"))?;
                    Value::Bytes(take(bytes, &mut position, length)?.to_vec())
                }
                WIRE_FIXED32 => Value::Fixed32(take(bytes, &mut position, 4)?.try_into().unwrap()),
                _ => return Err(invalid("a field has an unsupported wire type")),
            };
            fields.push(Field { number, value });
        }
        Ok(Self { fields })
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut output = Vec::new();
        for field in &self.fields {
            let wire_type = match field.value {
                Value::Varint(_) => WIRE_VARINT,
                Value::Fixed64(_) => WIRE_FIXED64,
                Value::Bytes(_) => WIRE_BYTES,
                Value::Fixed32(_) => WIRE_FIXED32,
            };
            write_varint(
                &mut output,
                (u64::from(field.number) << 3) | u64::from(wire_type),
            );
            match &field.value {
                Value::Varint(value) => write_varint(&mut output, *value),
                Value::Fixed64(bytes) => output.extend_from_slice(bytes),
                Value::Bytes(bytes) => {
                    write_varint(&mut output, bytes.len() as u64);
                    output.extend_from_slice(bytes);
                }
                Value::Fixed32(bytes) => output.extend_from_slice(bytes),
            }
        }
        output
    }

    /// Every length-delimited value of field `number`, in order.
    pub fn bytes(&self, number: u32) -> impl Iterator<Item = &[u8]> {
        self.fields
            .iter()
            .filter(move |field| field.number == number)
            .filter_map(|field| match &field.value {
                Value::Bytes(bytes) => Some(bytes.as_slice()),
                _ => None,
            })
    }

    /// A singular string field. The last value wins, as in protobuf.
    pub fn string(&self, number: u32) -> Result<Option<&str>> {
        self.bytes(number)
            .last()
            .map(|bytes| std::str::from_utf8(bytes).map_err(|_| invalid("a string is not UTF-8")))
            .transpose()
    }

    /// A singular number field. The last value wins, as in protobuf.
    pub fn varint(&self, number: u32) -> Option<u64> {
        self.fields
            .iter()
            .rev()
            .filter(|field| field.number == number)
            .find_map(|field| match field.value {
                Value::Varint(value) => Some(value),
                _ => None,
            })
    }

    pub fn has(&self, number: u32) -> bool {
        self.fields.iter().any(|field| field.number == number)
    }

    /// A singular nested message, or `None` when the field is absent.
    pub fn message(&self, number: u32) -> Result<Option<Message>> {
        self.bytes(number).last().map(Message::parse).transpose()
    }

    /// Every nested message of a repeated field.
    pub fn messages(&self, number: u32) -> Result<Vec<Message>> {
        self.bytes(number).map(Message::parse).collect()
    }

    /// Replaces a singular field, keeping its position, or appends it.
    pub fn set(&mut self, number: u32, value: Value) {
        let mut kept = false;
        self.fields.retain_mut(|field| {
            if field.number != number {
                return true;
            }
            if kept {
                return false;
            }
            field.value = value.clone();
            kept = true;
            true
        });
        if !kept {
            self.fields.push(Field { number, value });
        }
    }

    pub fn set_string(&mut self, number: u32, value: &str) {
        self.set(number, Value::Bytes(value.as_bytes().to_vec()));
    }

    pub fn set_message(&mut self, number: u32, message: &Message) {
        self.set(number, Value::Bytes(message.encode()));
    }

    /// Decodes each nested message of field `number`, lets `edit` change it,
    /// and stores it again.
    pub fn edit_messages(
        &mut self,
        number: u32,
        edit: &mut dyn FnMut(&mut Message) -> Result<()>,
    ) -> Result<()> {
        for field in self
            .fields
            .iter_mut()
            .filter(|field| field.number == number)
        {
            let Value::Bytes(bytes) = &mut field.value else {
                return Err(invalid("a message field holds a number"));
            };
            let mut message = Message::parse(bytes)?;
            edit(&mut message)?;
            *bytes = message.encode();
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_every_wire_type_and_unknown_fields() {
        let mut nested = Message::default();
        nested.set_string(1, "inner");
        let message = Message {
            fields: vec![
                Field {
                    number: 1,
                    value: Value::Varint(u64::MAX),
                },
                Field {
                    number: 2,
                    value: Value::Fixed64([1, 2, 3, 4, 5, 6, 7, 8]),
                },
                Field {
                    number: 3,
                    value: Value::Bytes(nested.encode()),
                },
                Field {
                    number: 536_870_911,
                    value: Value::Fixed32([9, 8, 7, 6]),
                },
                Field {
                    number: 3,
                    value: Value::Bytes(Vec::new()),
                },
            ],
        };
        let encoded = message.encode();
        assert_eq!(Message::parse(&encoded).unwrap(), message);
        assert_eq!(Message::parse(&encoded).unwrap().encode(), encoded);
        assert_eq!(message.messages(3).unwrap().len(), 2);
        assert_eq!(
            message.messages(3).unwrap()[0].string(1).unwrap(),
            Some("inner")
        );
    }

    #[test]
    fn edits_nested_messages_and_recomputes_lengths() {
        let mut child = Message::default();
        child.set_string(2, "short");
        let mut parent = Message::default();
        parent.set_message(5, &child);
        parent.set(9, Value::Varint(7));

        parent
            .edit_messages(5, &mut |child| {
                child.set_string(2, &"long ".repeat(40));
                Ok(())
            })
            .unwrap();
        let reparsed = Message::parse(&parent.encode()).unwrap();
        assert_eq!(
            reparsed.message(5).unwrap().unwrap().string(2).unwrap(),
            Some("long ".repeat(40).as_str())
        );
        assert_eq!(reparsed.varint(9), Some(7));
        assert_eq!(reparsed.fields[0].number, 5);
    }

    #[test]
    fn set_replaces_in_place_and_drops_repeats() {
        let mut message = Message::default();
        message.set(1, Value::Varint(1));
        message.set(2, Value::Varint(2));
        message.fields.push(Field {
            number: 1,
            value: Value::Varint(3),
        });
        message.set(1, Value::Varint(4));
        assert_eq!(
            message.fields,
            vec![
                Field {
                    number: 1,
                    value: Value::Varint(4)
                },
                Field {
                    number: 2,
                    value: Value::Varint(2)
                },
            ]
        );
    }

    #[test]
    fn refuses_damaged_input() {
        for damaged in [
            &[0x0a, 0x05, b'a'][..],
            &[0x08][..],
            &[
                0x08, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x02,
            ][..],
            &[0x0b][..],
            &[0x00, 0x01][..],
        ] {
            assert!(Message::parse(damaged).is_err(), "{damaged:?}");
        }
    }
}
