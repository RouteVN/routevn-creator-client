use std::{
    fs,
    path::Path,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

const SCHEMA_VERSION: i64 = 1;
const BUSY_TIMEOUT: Duration = Duration::from_millis(5_000);
const SAVE_FORMAT_VERSION: i64 = 1;
const MAX_JAVASCRIPT_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

const SAVE_SLOT_KEY_PREFIX: &str = "saveSlots:";
const GLOBAL_DEVICE_VARIABLES_KEY: &str = "globalDeviceVariables";
const GLOBAL_ACCOUNT_VARIABLES_KEY: &str = "globalAccountVariables";
const GLOBAL_RUNTIME_KEY: &str = "globalRuntime";
const ACCOUNT_VIEWED_REGISTRY_KEY: &str = "accountViewedRegistry";

const CREATE_SCHEMA_SQL: &str = r#"
BEGIN IMMEDIATE;

CREATE TABLE persistence_values (
  key TEXT PRIMARY KEY CHECK (
    key IN (
      'globalDeviceVariables',
      'globalAccountVariables',
      'globalRuntime',
      'accountViewedRegistry'
    )
    OR key GLOB 'saveSlots:?*'
  ),
  value_json TEXT NOT NULL CHECK (
    json_valid(value_json)
    AND json_type(value_json) = 'object'
  ),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
);

PRAGMA user_version = 1;

COMMIT;
"#;

type PersistenceResult<T> = Result<T, String>;

fn empty_object() -> Value {
    Value::Object(Map::new())
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlayerPersistenceState {
    save_slots: Value,
    global_device_variables: Value,
    global_account_variables: Value,
    global_runtime: Value,
    account_viewed_registry: Value,
}

impl Default for PlayerPersistenceState {
    fn default() -> Self {
        Self {
            save_slots: empty_object(),
            global_device_variables: empty_object(),
            global_account_variables: empty_object(),
            global_runtime: empty_object(),
            account_viewed_registry: empty_object(),
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ScopedDataUpdate {
    scope: String,
    path: String,
    op: String,
    value: Value,
}

#[derive(Clone, Debug, PartialEq)]
struct StoredViewedSection {
    section_id: String,
    last_line_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
struct MarkViewedSection {
    section_id: String,
    line_id: Option<String>,
}

fn current_timestamp_ms() -> PersistenceResult<i64> {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System time is before the Unix epoch: {error}"))?;
    i64::try_from(elapsed.as_millis())
        .map_err(|_| "Current timestamp does not fit in SQLite INTEGER".to_string())
}

fn open_database(path: &Path) -> PersistenceResult<Connection> {
    let parent = path
        .parent()
        .ok_or_else(|| "Runtime database path has no parent directory".to_string())?;
    fs::create_dir_all(parent).map_err(|error| {
        format!(
            "Failed to create runtime database directory {}: {error}",
            parent.display()
        )
    })?;

    let connection = Connection::open(path).map_err(|error| {
        format!(
            "Failed to open runtime database {}: {error}",
            path.display()
        )
    })?;
    connection
        .busy_timeout(BUSY_TIMEOUT)
        .map_err(|error| format!("Failed to configure SQLite busy timeout: {error}"))?;
    connection
        .execute_batch(
            "PRAGMA journal_mode = WAL;\nPRAGMA synchronous = FULL;\nPRAGMA busy_timeout = 5000;",
        )
        .map_err(|error| format!("Failed to configure runtime database durability: {error}"))?;

    let schema_version = connection
        .query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))
        .map_err(|error| format!("Failed to read runtime database schema version: {error}"))?;

    match schema_version {
        0 => connection
            .execute_batch(CREATE_SCHEMA_SQL)
            .map_err(|error| format!("Failed to create runtime database schema: {error}"))?,
        SCHEMA_VERSION => {}
        version => {
            return Err(format!(
                "Unsupported runtime database schema version: {version}"
            ));
        }
    }

    Ok(connection)
}

fn require_object(value: &Value, label: &str) -> PersistenceResult<()> {
    if value.is_object() {
        Ok(())
    } else {
        Err(format!("{label} must be a JSON object"))
    }
}

fn require_object_map<'a>(
    value: &'a Value,
    label: &str,
) -> PersistenceResult<&'a Map<String, Value>> {
    value
        .as_object()
        .ok_or_else(|| format!("{label} must be a JSON object"))
}

fn require_array<'a>(value: &'a Value, label: &str) -> PersistenceResult<&'a Vec<Value>> {
    value
        .as_array()
        .ok_or_else(|| format!("{label} must be a JSON array"))
}

fn require_field<'a>(
    value: &'a Map<String, Value>,
    field: &str,
    label: &str,
) -> PersistenceResult<&'a Value> {
    value
        .get(field)
        .ok_or_else(|| format!("{label}.{field} is required"))
}

fn reject_unknown_fields(
    value: &Map<String, Value>,
    allowed_fields: &[&str],
    label: &str,
) -> PersistenceResult<()> {
    if let Some(field) = value
        .keys()
        .find(|field| !allowed_fields.contains(&field.as_str()))
    {
        return Err(format!("{label}.{field} is not supported"));
    }

    Ok(())
}

fn require_non_empty_string(value: &Value, label: &str) -> PersistenceResult<()> {
    match value.as_str() {
        Some(value) if !value.is_empty() => Ok(()),
        _ => Err(format!("{label} must be a non-empty JSON string")),
    }
}

fn require_string(value: &Value, label: &str) -> PersistenceResult<()> {
    if value.is_string() {
        Ok(())
    } else {
        Err(format!("{label} must be a JSON string"))
    }
}

fn require_boolean(value: &Value, label: &str) -> PersistenceResult<()> {
    if value.is_boolean() {
        Ok(())
    } else {
        Err(format!("{label} must be a JSON boolean"))
    }
}

fn require_number(value: &Value, label: &str) -> PersistenceResult<f64> {
    value
        .as_f64()
        .ok_or_else(|| format!("{label} must be a finite JSON number"))
}

fn require_safe_integer(value: &Value, label: &str) -> PersistenceResult<i64> {
    let number = require_number(value, label)?;
    if number.fract() != 0.0 || number.abs() > MAX_JAVASCRIPT_SAFE_INTEGER as f64 {
        return Err(format!("{label} must be a JavaScript-safe JSON integer"));
    }

    Ok(number as i64)
}

fn validate_variable_value(value: &Value, label: &str) -> PersistenceResult<()> {
    if value.is_null() {
        return Err(format!(
            "{label} must be a JSON string, number, boolean, object, or array"
        ));
    }

    Ok(())
}

fn validate_variable_map(value: &Value, label: &str) -> PersistenceResult<()> {
    let variables = require_object_map(value, label)?;
    for (variable_id, variable_value) in variables {
        if variable_id.is_empty() {
            return Err(format!("{label} contains an empty variable ID"));
        }
        validate_variable_value(variable_value, &format!("{label}.{variable_id}"))?;
    }

    Ok(())
}

fn validate_global_runtime(value: &Value, label: &str) -> PersistenceResult<()> {
    let runtime = require_object_map(value, label)?;
    reject_unknown_fields(
        runtime,
        &[
            "dialogueTextSpeed",
            "autoForwardDelay",
            "skipUnseenText",
            "skipTransitionsAndAnimations",
            "soundVolume",
            "musicVolume",
            "muteAll",
        ],
        label,
    )?;

    for field in [
        "dialogueTextSpeed",
        "autoForwardDelay",
        "soundVolume",
        "musicVolume",
    ] {
        let Some(field_value) = runtime.get(field) else {
            continue;
        };
        let number = require_number(field_value, &format!("{label}.{field}"))?;
        if ["soundVolume", "musicVolume"].contains(&field) && !(0.0..=100.0).contains(&number) {
            return Err(format!("{label}.{field} must be between 0 and 100"));
        }
    }

    for field in ["skipUnseenText", "skipTransitionsAndAnimations", "muteAll"] {
        if let Some(field_value) = runtime.get(field) {
            require_boolean(field_value, &format!("{label}.{field}"))?;
        }
    }

    Ok(())
}

fn validate_viewed_registry_id(value: &Value, label: &str) -> PersistenceResult<()> {
    match value {
        Value::String(value) if !value.is_empty() => Ok(()),
        Value::Number(_) => {
            require_safe_integer(value, label)?;
            Ok(())
        }
        _ => Err(format!(
            "{label} must be a non-empty JSON string or JavaScript-safe integer"
        )),
    }
}

fn validate_stored_viewed_sections(value: &Value, label: &str) -> PersistenceResult<()> {
    for (index, entry) in require_array(value, label)?.iter().enumerate() {
        let entry_label = format!("{label}[{index}]");
        if entry.is_string() || entry.is_number() {
            validate_viewed_registry_id(entry, &entry_label)?;
            continue;
        }

        let entry = require_object_map(entry, &entry_label)?;
        reject_unknown_fields(entry, &["sectionId", "lastLineId"], &entry_label)?;
        require_non_empty_string(
            require_field(entry, "sectionId", &entry_label)?,
            &format!("{entry_label}.sectionId"),
        )?;

        if let Some(last_line_id) = entry.get("lastLineId") {
            if !last_line_id.is_null() {
                require_string(last_line_id, &format!("{entry_label}.lastLineId"))?;
            }
        }
    }

    Ok(())
}

fn validate_stored_viewed_resources(value: &Value, label: &str) -> PersistenceResult<()> {
    for (index, entry) in require_array(value, label)?.iter().enumerate() {
        let entry_label = format!("{label}[{index}]");
        if entry.is_string() || entry.is_number() {
            validate_viewed_registry_id(entry, &entry_label)?;
            continue;
        }

        let entry = require_object_map(entry, &entry_label)?;
        reject_unknown_fields(entry, &["resourceId"], &entry_label)?;
        require_non_empty_string(
            require_field(entry, "resourceId", &entry_label)?,
            &format!("{entry_label}.resourceId"),
        )?;
    }

    Ok(())
}

fn validate_account_viewed_registry(value: &Value, label: &str) -> PersistenceResult<()> {
    let registry = require_object_map(value, label)?;
    reject_unknown_fields(registry, &["sections", "resources"], label)?;
    if let Some(sections) = registry.get("sections") {
        validate_stored_viewed_sections(sections, &format!("{label}.sections"))?;
    }
    if let Some(resources) = registry.get("resources") {
        validate_stored_viewed_resources(resources, &format!("{label}.resources"))?;
    }

    Ok(())
}

fn validate_viewed_registry_patch(value: &Value, label: &str) -> PersistenceResult<()> {
    let patch = require_object_map(value, label)?;
    reject_unknown_fields(patch, &["sections", "resources"], label)?;
    if !patch.contains_key("sections") && !patch.contains_key("resources") {
        return Err(format!("{label} must contain sections, resources, or both"));
    }

    if let Some(sections) = patch.get("sections") {
        for (index, section) in require_array(sections, &format!("{label}.sections"))?
            .iter()
            .enumerate()
        {
            let section_label = format!("{label}.sections[{index}]");
            let section = require_object_map(section, &section_label)?;
            reject_unknown_fields(section, &["sectionId", "lineId"], &section_label)?;
            require_non_empty_string(
                require_field(section, "sectionId", &section_label)?,
                &format!("{section_label}.sectionId"),
            )?;
            if let Some(line_id) = section.get("lineId") {
                require_non_empty_string(line_id, &format!("{section_label}.lineId"))?;
            }
        }
    }

    if let Some(resources) = patch.get("resources") {
        for (index, resource) in require_array(resources, &format!("{label}.resources"))?
            .iter()
            .enumerate()
        {
            let resource_label = format!("{label}.resources[{index}]");
            let resource = require_object_map(resource, &resource_label)?;
            reject_unknown_fields(resource, &["resourceId"], &resource_label)?;
            require_non_empty_string(
                require_field(resource, "resourceId", &resource_label)?,
                &format!("{resource_label}.resourceId"),
            )?;
        }
    }

    Ok(())
}

fn validate_read_pointer(value: &Value, label: &str) -> PersistenceResult<()> {
    let pointer = require_object_map(value, label)?;
    reject_unknown_fields(pointer, &["sceneId", "sectionId", "lineId"], label)?;
    if let Some(scene_id) = pointer.get("sceneId") {
        require_string(scene_id, &format!("{label}.sceneId"))?;
    }
    require_non_empty_string(
        require_field(pointer, "sectionId", label)?,
        &format!("{label}.sectionId"),
    )?;
    require_non_empty_string(
        require_field(pointer, "lineId", label)?,
        &format!("{label}.lineId"),
    )
}

fn validate_context_runtime(value: &Value, label: &str) -> PersistenceResult<()> {
    let runtime = require_object_map(value, label)?;
    reject_unknown_fields(
        runtime,
        &["saveLoadPagination", "menuPage", "menuEntryPoint"],
        label,
    )?;

    let pagination = require_safe_integer(
        require_field(runtime, "saveLoadPagination", label)?,
        &format!("{label}.saveLoadPagination"),
    )?;
    if pagination < 1 {
        return Err(format!("{label}.saveLoadPagination must be at least 1"));
    }
    require_string(
        require_field(runtime, "menuPage", label)?,
        &format!("{label}.menuPage"),
    )?;
    require_string(
        require_field(runtime, "menuEntryPoint", label)?,
        &format!("{label}.menuEntryPoint"),
    )
}

fn validate_rollback_checkpoint(value: &Value, label: &str) -> PersistenceResult<()> {
    let checkpoint = require_object_map(value, label)?;
    reject_unknown_fields(
        checkpoint,
        &["sectionId", "lineId", "rollbackPolicy", "executedActions"],
        label,
    )?;
    require_non_empty_string(
        require_field(checkpoint, "sectionId", label)?,
        &format!("{label}.sectionId"),
    )?;
    require_non_empty_string(
        require_field(checkpoint, "lineId", label)?,
        &format!("{label}.lineId"),
    )?;

    if let Some(rollback_policy) = checkpoint.get("rollbackPolicy") {
        require_string(rollback_policy, &format!("{label}.rollbackPolicy"))?;
    }
    if let Some(executed_actions) = checkpoint.get("executedActions") {
        for (index, action) in require_array(executed_actions, &format!("{label}.executedActions"))?
            .iter()
            .enumerate()
        {
            let action_label = format!("{label}.executedActions[{index}]");
            let action = require_object_map(action, &action_label)?;
            reject_unknown_fields(action, &["type", "payload"], &action_label)?;
            require_non_empty_string(
                require_field(action, "type", &action_label)?,
                &format!("{action_label}.type"),
            )?;
        }
    }

    Ok(())
}

fn validate_rollback(
    value: &Value,
    read_pointer: &Map<String, Value>,
    label: &str,
) -> PersistenceResult<()> {
    let rollback = require_object_map(value, label)?;
    reject_unknown_fields(
        rollback,
        &[
            "timeline",
            "currentIndex",
            "isRestoring",
            "replayStartIndex",
        ],
        label,
    )?;

    let timeline = require_array(
        require_field(rollback, "timeline", label)?,
        &format!("{label}.timeline"),
    )?;
    if timeline.is_empty() {
        return Err(format!("{label}.timeline must not be empty"));
    }
    for (index, checkpoint) in timeline.iter().enumerate() {
        validate_rollback_checkpoint(checkpoint, &format!("{label}.timeline[{index}]"))?;
    }

    let current_index = require_safe_integer(
        require_field(rollback, "currentIndex", label)?,
        &format!("{label}.currentIndex"),
    )?;
    if current_index < 0 || current_index as usize >= timeline.len() {
        return Err(format!(
            "{label}.currentIndex must identify an entry in {label}.timeline"
        ));
    }
    require_boolean(
        require_field(rollback, "isRestoring", label)?,
        &format!("{label}.isRestoring"),
    )?;
    let replay_start_index = require_safe_integer(
        require_field(rollback, "replayStartIndex", label)?,
        &format!("{label}.replayStartIndex"),
    )?;
    if replay_start_index < 0 {
        return Err(format!("{label}.replayStartIndex must not be negative"));
    }

    let current_checkpoint = timeline[current_index as usize]
        .as_object()
        .expect("validated rollback checkpoint");
    if current_checkpoint.get("sectionId") != read_pointer.get("sectionId")
        || current_checkpoint.get("lineId") != read_pointer.get("lineId")
    {
        return Err(format!(
            "{label}.timeline[currentIndex] must match the context read pointer"
        ));
    }

    Ok(())
}

fn validate_save_context(value: &Value, label: &str) -> PersistenceResult<()> {
    let context = require_object_map(value, label)?;
    reject_unknown_fields(
        context,
        &[
            "currentPointerMode",
            "pointers",
            "configuration",
            "views",
            "bgm",
            "variables",
            "runtime",
            "rollback",
        ],
        label,
    )?;

    match require_field(context, "currentPointerMode", label)?.as_str() {
        Some("read") => {}
        _ => {
            return Err(format!("{label}.currentPointerMode must be \"read\""));
        }
    }

    let pointers_label = format!("{label}.pointers");
    let pointers = require_object_map(require_field(context, "pointers", label)?, &pointers_label)?;
    reject_unknown_fields(pointers, &["read"], &pointers_label)?;
    let read_pointer_label = format!("{pointers_label}.read");
    let read_pointer_value = require_field(pointers, "read", &pointers_label)?;
    validate_read_pointer(read_pointer_value, &read_pointer_label)?;
    let read_pointer = read_pointer_value
        .as_object()
        .expect("validated context read pointer");

    require_object(
        require_field(context, "configuration", label)?,
        &format!("{label}.configuration"),
    )?;

    let views = require_array(
        require_field(context, "views", label)?,
        &format!("{label}.views"),
    )?;
    for (index, view) in views.iter().enumerate() {
        require_object(view, &format!("{label}.views[{index}]"))?;
    }

    let bgm_label = format!("{label}.bgm");
    let bgm = require_object_map(require_field(context, "bgm", label)?, &bgm_label)?;
    if let Some(resource_id) = bgm.get("resourceId") {
        require_string(resource_id, &format!("{bgm_label}.resourceId"))?;
    }

    validate_variable_map(
        require_field(context, "variables", label)?,
        &format!("{label}.variables"),
    )?;
    if let Some(runtime) = context.get("runtime") {
        validate_context_runtime(runtime, &format!("{label}.runtime"))?;
    }
    validate_rollback(
        require_field(context, "rollback", label)?,
        read_pointer,
        &format!("{label}.rollback"),
    )
}

fn save_slot_id_storage_key(value: &Value, label: &str) -> PersistenceResult<String> {
    match value {
        Value::String(value) if !value.is_empty() => Ok(value.clone()),
        Value::Number(_) => Ok(require_safe_integer(value, label)?.to_string()),
        _ => Err(format!(
            "{label} must be a non-empty JSON string or JavaScript-safe integer"
        )),
    }
}

fn validate_save_slot(slot_key: &str, value: &Value, label: &str) -> PersistenceResult<()> {
    let save_slot = require_object_map(value, label)?;
    let format_version = require_safe_integer(
        require_field(save_slot, "formatVersion", label)?,
        &format!("{label}.formatVersion"),
    )?;
    if format_version != SAVE_FORMAT_VERSION {
        return Err(format!(
            "{label}.formatVersion must be {SAVE_FORMAT_VERSION}"
        ));
    }

    let stored_slot_key = save_slot_id_storage_key(
        require_field(save_slot, "slotId", label)?,
        &format!("{label}.slotId"),
    )?;
    if stored_slot_key != slot_key {
        return Err(format!(
            "{label}.slotId must match persistence key {SAVE_SLOT_KEY_PREFIX}{slot_key}"
        ));
    }

    let saved_at = require_safe_integer(
        require_field(save_slot, "savedAt", label)?,
        &format!("{label}.savedAt"),
    )?;
    if saved_at < 0 {
        return Err(format!("{label}.savedAt must not be negative"));
    }
    if let Some(image) = save_slot.get("image") {
        if !image.is_null() {
            require_string(image, &format!("{label}.image"))?;
        }
    }

    let state_label = format!("{label}.state");
    let state = require_object_map(require_field(save_slot, "state", label)?, &state_label)?;
    reject_unknown_fields(state, &["contexts"], &state_label)?;
    let contexts = require_array(
        require_field(state, "contexts", &state_label)?,
        &format!("{state_label}.contexts"),
    )?;
    if contexts.is_empty() {
        return Err(format!("{state_label}.contexts must not be empty"));
    }
    for (index, context) in contexts.iter().enumerate() {
        validate_save_context(context, &format!("{state_label}.contexts[{index}]"))?;
    }

    Ok(())
}

fn validate_persistence_value(key: &str, value: &Value) -> PersistenceResult<()> {
    validate_persistence_key(key)?;
    let label = format!("Runtime persistence key {key}");
    if let Some(slot_key) = persistence_save_slot_key(key) {
        return validate_save_slot(slot_key, value, &label);
    }

    match key {
        GLOBAL_DEVICE_VARIABLES_KEY | GLOBAL_ACCOUNT_VARIABLES_KEY => {
            validate_variable_map(value, &label)
        }
        GLOBAL_RUNTIME_KEY => validate_global_runtime(value, &label),
        ACCOUNT_VIEWED_REGISTRY_KEY => validate_account_viewed_registry(value, &label),
        _ => Err(format!("Unsupported runtime persistence key: {key}")),
    }
}

fn validate_save_slots_value(save_slots: &Value) -> PersistenceResult<()> {
    let save_slots = require_object_map(save_slots, "Runtime save slots")?;
    for (slot_key, value) in save_slots {
        let key = save_slot_persistence_key(slot_key)?;
        validate_persistence_value(&key, value)?;
    }

    Ok(())
}

fn save_slot_persistence_key(slot_key: &str) -> PersistenceResult<String> {
    if slot_key.is_empty() {
        return Err("Runtime save slot key must not be empty".to_string());
    }

    Ok(format!("{SAVE_SLOT_KEY_PREFIX}{slot_key}"))
}

fn persistence_save_slot_key(key: &str) -> Option<&str> {
    key.strip_prefix(SAVE_SLOT_KEY_PREFIX)
        .filter(|slot_key| !slot_key.is_empty())
}

fn validate_persistence_key(key: &str) -> PersistenceResult<()> {
    if [
        GLOBAL_DEVICE_VARIABLES_KEY,
        GLOBAL_ACCOUNT_VARIABLES_KEY,
        GLOBAL_RUNTIME_KEY,
        ACCOUNT_VIEWED_REGISTRY_KEY,
    ]
    .contains(&key)
        || persistence_save_slot_key(key).is_some()
    {
        Ok(())
    } else {
        Err(format!("Unsupported runtime persistence key: {key}"))
    }
}

fn read_persistence_value(connection: &Connection, key: &str) -> PersistenceResult<Value> {
    let value_json = connection
        .query_row(
            "SELECT value_json FROM persistence_values WHERE key = ?1",
            [key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("Failed to read runtime persistence key {key}: {error}"))?;

    let Some(value_json) = value_json else {
        return Ok(empty_object());
    };
    let value = serde_json::from_str::<Value>(&value_json)
        .map_err(|error| format!("Runtime persistence key {key} contains invalid JSON: {error}"))?;
    validate_persistence_value(key, &value)?;
    Ok(value)
}

fn upsert_persistence_value(
    connection: &Connection,
    key: &str,
    value: &Value,
    updated_at: i64,
) -> PersistenceResult<()> {
    validate_persistence_value(key, value)?;
    let value_json = serde_json::to_string(value)
        .map_err(|error| format!("Failed to serialize runtime persistence key {key}: {error}"))?;
    connection
        .execute(
            "INSERT INTO persistence_values (key, value_json, updated_at)\n\
             VALUES (?1, ?2, ?3)\n\
             ON CONFLICT(key) DO UPDATE SET\n\
               value_json = excluded.value_json,\n\
               updated_at = excluded.updated_at\n\
             WHERE persistence_values.value_json <> excluded.value_json",
            params![key, value_json, updated_at],
        )
        .map_err(|error| format!("Failed to persist runtime key {key}: {error}"))?;
    Ok(())
}

fn read_save_slots(connection: &Connection) -> PersistenceResult<Value> {
    let mut statement = connection
        .prepare(
            "SELECT key, value_json FROM persistence_values
             WHERE substr(key, 1, ?1) = ?2
             ORDER BY key",
        )
        .map_err(|error| format!("Failed to prepare runtime save-slot load: {error}"))?;
    let rows = statement
        .query_map(
            params![SAVE_SLOT_KEY_PREFIX.len() as i64, SAVE_SLOT_KEY_PREFIX],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|error| format!("Failed to read runtime save slots: {error}"))?;
    let mut save_slots = Map::new();

    for row in rows {
        let (key, value_json) =
            row.map_err(|error| format!("Failed to read runtime save-slot row: {error}"))?;
        let slot_key = persistence_save_slot_key(&key)
            .ok_or_else(|| format!("Malformed runtime save-slot persistence key: {key}"))?;
        let value = serde_json::from_str::<Value>(&value_json).map_err(|error| {
            format!("Runtime persistence key {key} contains invalid JSON: {error}")
        })?;
        validate_persistence_value(&key, &value)?;
        save_slots.insert(slot_key.to_string(), value);
    }

    Ok(Value::Object(save_slots))
}

fn sync_save_slots(
    connection: &Connection,
    save_slots: &Value,
    updated_at: i64,
) -> PersistenceResult<()> {
    validate_save_slots_value(save_slots)?;
    let save_slots = save_slots
        .as_object()
        .expect("validated runtime save-slot object");

    let existing_slot_keys = {
        let mut statement = connection
            .prepare(
                "SELECT key FROM persistence_values
                 WHERE substr(key, 1, ?1) = ?2",
            )
            .map_err(|error| format!("Failed to prepare runtime save-slot sync: {error}"))?;
        let rows = statement
            .query_map(
                params![SAVE_SLOT_KEY_PREFIX.len() as i64, SAVE_SLOT_KEY_PREFIX],
                |row| row.get::<_, String>(0),
            )
            .map_err(|error| format!("Failed to inspect runtime save slots: {error}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("Failed to inspect runtime save-slot row: {error}"))?
    };

    for key in existing_slot_keys {
        let slot_key = persistence_save_slot_key(&key)
            .ok_or_else(|| format!("Malformed runtime save-slot persistence key: {key}"))?;
        if !save_slots.contains_key(slot_key) {
            connection
                .execute("DELETE FROM persistence_values WHERE key = ?1", [&key])
                .map_err(|error| {
                    format!("Failed to delete runtime save slot {slot_key}: {error}")
                })?;
        }
    }

    for (slot_key, value) in save_slots {
        let key = save_slot_persistence_key(slot_key)?;
        upsert_persistence_value(connection, &key, value, updated_at)?;
    }

    Ok(())
}

fn load_from_connection(connection: &Connection) -> PersistenceResult<PlayerPersistenceState> {
    Ok(PlayerPersistenceState {
        save_slots: read_save_slots(connection)?,
        global_device_variables: read_persistence_value(connection, GLOBAL_DEVICE_VARIABLES_KEY)?,
        global_account_variables: read_persistence_value(connection, GLOBAL_ACCOUNT_VARIABLES_KEY)?,
        global_runtime: read_persistence_value(connection, GLOBAL_RUNTIME_KEY)?,
        account_viewed_registry: read_persistence_value(connection, ACCOUNT_VIEWED_REGISTRY_KEY)?,
    })
}

pub(crate) fn load(path: &Path) -> PersistenceResult<PlayerPersistenceState> {
    let connection = open_database(path)?;
    load_from_connection(&connection)
}

pub(crate) fn save_value(path: &Path, key: &str, value: Value) -> PersistenceResult<()> {
    if persistence_save_slot_key(key).is_some() {
        return Err("Runtime save slots must be written through the save-slot sync".to_string());
    }
    validate_persistence_value(key, &value)?;
    let mut connection = open_database(path)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("Failed to begin runtime persistence transaction: {error}"))?;
    upsert_persistence_value(&transaction, key, &value, current_timestamp_ms()?)?;
    transaction
        .commit()
        .map_err(|error| format!("Failed to commit runtime persistence value: {error}"))
}

pub(crate) fn save_slots(path: &Path, save_slots: Value) -> PersistenceResult<()> {
    validate_save_slots_value(&save_slots)?;
    let mut connection = open_database(path)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("Failed to begin runtime save-slot transaction: {error}"))?;
    sync_save_slots(&transaction, &save_slots, current_timestamp_ms()?)?;
    transaction
        .commit()
        .map_err(|error| format!("Failed to commit runtime save slots: {error}"))
}

pub(crate) fn clear(path: &Path) -> PersistenceResult<()> {
    let mut connection = open_database(path)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("Failed to begin runtime clear transaction: {error}"))?;
    transaction
        .execute("DELETE FROM persistence_values", [])
        .map_err(|error| format!("Failed to clear runtime persistence values: {error}"))?;
    transaction
        .commit()
        .map_err(|error| format!("Failed to commit runtime persistence clear: {error}"))
}

fn string_or_number_id(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}

fn normalize_stored_sections(value: &Value) -> Vec<StoredViewedSection> {
    value
        .as_object()
        .and_then(|registry| registry.get("sections"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|section| {
            if let Some(section_id) = string_or_number_id(section) {
                return Some(StoredViewedSection {
                    section_id,
                    last_line_id: None,
                });
            }

            let section = section.as_object()?;
            let section_id = section.get("sectionId")?.as_str()?.to_string();
            if section_id.is_empty() {
                return None;
            }
            Some(StoredViewedSection {
                section_id,
                last_line_id: section
                    .get("lastLineId")
                    .and_then(Value::as_str)
                    .map(str::to_string),
            })
        })
        .collect()
}

fn normalize_mark_viewed_sections(value: &Value) -> Vec<MarkViewedSection> {
    value
        .as_object()
        .and_then(|registry| registry.get("sections"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|section| {
            if let Some(section_id) = string_or_number_id(section) {
                return Some(MarkViewedSection {
                    section_id,
                    line_id: None,
                });
            }

            let section = section.as_object()?;
            let section_id = section.get("sectionId")?.as_str()?.to_string();
            if section_id.is_empty() {
                return None;
            }
            Some(MarkViewedSection {
                section_id,
                line_id: section
                    .get("lineId")
                    .and_then(Value::as_str)
                    .map(str::to_string),
            })
        })
        .collect()
}

fn normalize_resource_ids(value: &Value) -> Vec<String> {
    value
        .as_object()
        .and_then(|registry| registry.get("resources"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|resource| {
            if let Some(resource_id) = string_or_number_id(resource) {
                return Some(resource_id);
            }

            let resource = resource.as_object()?;
            let resource_id = resource.get("resourceId")?.as_str()?.to_string();
            (!resource_id.is_empty()).then_some(resource_id)
        })
        .collect()
}

fn mark_viewed_in_registry(current: &Value, patch: &Value) -> Value {
    let mut sections = normalize_stored_sections(current);
    let mut resources = normalize_resource_ids(current);

    for section_patch in normalize_mark_viewed_sections(patch) {
        let existing = sections
            .iter_mut()
            .find(|section| section.section_id == section_patch.section_id);
        let Some(existing) = existing else {
            sections.push(StoredViewedSection {
                section_id: section_patch.section_id,
                last_line_id: section_patch.line_id,
            });
            continue;
        };

        if existing.last_line_id.is_none() {
            continue;
        }
        existing.last_line_id = section_patch.line_id;
    }

    for resource_id in normalize_resource_ids(patch) {
        if !resources.contains(&resource_id) {
            resources.push(resource_id);
        }
    }

    let section_values = sections
        .into_iter()
        .map(|section| {
            let mut value = Map::new();
            value.insert("sectionId".to_string(), Value::String(section.section_id));
            if let Some(last_line_id) = section.last_line_id {
                value.insert("lastLineId".to_string(), Value::String(last_line_id));
            }
            Value::Object(value)
        })
        .collect();
    let resource_values = resources
        .into_iter()
        .map(|resource_id| {
            let mut value = Map::new();
            value.insert("resourceId".to_string(), Value::String(resource_id));
            Value::Object(value)
        })
        .collect();

    let mut registry = Map::new();
    registry.insert("sections".to_string(), Value::Array(section_values));
    registry.insert("resources".to_string(), Value::Array(resource_values));
    Value::Object(registry)
}

pub(crate) fn apply_scoped_data_updates(
    path: &Path,
    updates: Vec<ScopedDataUpdate>,
) -> PersistenceResult<()> {
    let mut connection = open_database(path)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("Failed to begin scoped persistence update: {error}"))?;

    let mut device_variables = read_persistence_value(&transaction, GLOBAL_DEVICE_VARIABLES_KEY)?;
    let mut account_variables = read_persistence_value(&transaction, GLOBAL_ACCOUNT_VARIABLES_KEY)?;
    let mut viewed_registry = read_persistence_value(&transaction, ACCOUNT_VIEWED_REGISTRY_KEY)?;
    let mut device_variables_changed = false;
    let mut account_variables_changed = false;
    let mut viewed_registry_changed = false;

    for (index, update) in updates.into_iter().enumerate() {
        if let Some(variable_id) = update.path.strip_prefix("variables.") {
            if variable_id.is_empty() {
                return Err(format!(
                    "Malformed scoped persistence variable path at updates[{index}]"
                ));
            }
            if update.op != "set" {
                return Err(format!(
                    "Unsupported scoped persistence operation {} at updates[{index}]",
                    update.op
                ));
            }
            validate_variable_value(
                &update.value,
                &format!("Scoped persistence updates[{index}].value"),
            )?;

            match update.scope.as_str() {
                "device" => {
                    device_variables
                        .as_object_mut()
                        .expect("validated persistence object")
                        .insert(variable_id.to_string(), update.value);
                    device_variables_changed = true;
                }
                "account" => {
                    account_variables
                        .as_object_mut()
                        .expect("validated persistence object")
                        .insert(variable_id.to_string(), update.value);
                    account_variables_changed = true;
                }
                scope => {
                    return Err(format!(
                        "Unsupported scoped persistence scope {scope} at updates[{index}]"
                    ));
                }
            }
            continue;
        }

        if update.path == "viewedRegistry" {
            if update.scope != "account" {
                return Err(format!(
                    "Unsupported viewed-registry scope {} at updates[{index}]",
                    update.scope
                ));
            }
            if update.op != "markViewed" {
                return Err(format!(
                    "Unsupported viewed-registry operation {} at updates[{index}]",
                    update.op
                ));
            }
            validate_viewed_registry_patch(
                &update.value,
                &format!("Scoped persistence updates[{index}].value"),
            )?;
            viewed_registry = mark_viewed_in_registry(&viewed_registry, &update.value);
            viewed_registry_changed = true;
            continue;
        }

        return Err(format!(
            "Unsupported scoped persistence path {} at updates[{index}]",
            update.path
        ));
    }

    let updated_at = current_timestamp_ms()?;
    if device_variables_changed {
        upsert_persistence_value(
            &transaction,
            GLOBAL_DEVICE_VARIABLES_KEY,
            &device_variables,
            updated_at,
        )?;
    }
    if account_variables_changed {
        upsert_persistence_value(
            &transaction,
            GLOBAL_ACCOUNT_VARIABLES_KEY,
            &account_variables,
            updated_at,
        )?;
    }
    if viewed_registry_changed {
        upsert_persistence_value(
            &transaction,
            ACCOUNT_VIEWED_REGISTRY_KEY,
            &viewed_registry,
            updated_at,
        )?;
    }

    transaction
        .commit()
        .map_err(|error| format!("Failed to commit scoped persistence update: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::TempDir;

    fn database_path() -> (TempDir, std::path::PathBuf) {
        let directory = tempfile::tempdir().expect("temporary database directory");
        let path = directory.path().join("runtime.db");
        (directory, path)
    }

    fn valid_save_slot(slot_id: Value, line_id: &str) -> Value {
        json!({
            "formatVersion": SAVE_FORMAT_VERSION,
            "slotId": slot_id,
            "savedAt": 1_700_000_000_000_i64,
            "image": null,
            "state": {
                "contexts": [{
                    "currentPointerMode": "read",
                    "pointers": {
                        "read": {
                            "sectionId": "section-1",
                            "lineId": line_id
                        }
                    },
                    "configuration": {},
                    "views": [],
                    "bgm": {},
                    "variables": {},
                    "rollback": {
                        "currentIndex": 0,
                        "isRestoring": false,
                        "replayStartIndex": 0,
                        "timeline": [{
                            "sectionId": "section-1",
                            "lineId": line_id,
                            "rollbackPolicy": "free"
                        }]
                    }
                }]
            }
        })
    }

    fn replace_save_slot_value(mut save_slot: Value, pointer: &str, value: Value) -> Value {
        *save_slot
            .pointer_mut(pointer)
            .unwrap_or_else(|| panic!("save-slot fixture pointer {pointer}")) = value;
        save_slot
    }

    #[test]
    fn creates_empty_versioned_database() {
        let (_directory, path) = database_path();
        let loaded = load(&path).expect("load empty persistence");

        assert_eq!(loaded, PlayerPersistenceState::default());

        let connection = open_database(&path).expect("open database");
        let version = connection
            .query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))
            .expect("schema version");
        assert_eq!(version, SCHEMA_VERSION);
        let journal_mode = connection
            .query_row("PRAGMA journal_mode", [], |row| row.get::<_, String>(0))
            .expect("journal mode");
        assert_eq!(journal_mode, "wal");
        let synchronous = connection
            .query_row("PRAGMA synchronous", [], |row| row.get::<_, i64>(0))
            .expect("synchronous mode");
        assert_eq!(synchronous, 2);
        let busy_timeout = connection
            .query_row("PRAGMA busy_timeout", [], |row| row.get::<_, i64>(0))
            .expect("busy timeout");
        assert_eq!(busy_timeout, 5_000);
        let metadata_table_count = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'persistence_metadata'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .expect("metadata table count");
        assert_eq!(metadata_table_count, 0);
    }

    #[test]
    fn accepts_the_complete_save_slot_contract_for_a_named_slot() {
        let (_directory, path) = database_path();
        let mut save_slot = valid_save_slot(json!("auto"), "line-2");
        let context = save_slot
            .pointer_mut("/state/contexts/0")
            .expect("save context")
            .as_object_mut()
            .expect("save context object");
        context.insert(
            "runtime".to_string(),
            json!({
                "saveLoadPagination": 2,
                "menuPage": "load",
                "menuEntryPoint": "pause"
            }),
        );
        context.insert(
            "views".to_string(),
            json!([{"layoutId": "dialogue", "visible": true}]),
        );
        context.insert("bgm".to_string(), json!({"resourceId": "bgm-1"}));
        context.insert(
            "variables".to_string(),
            json!({
                "routeUnlocked": true,
                "score": 12,
                "profile": {"name": "Ada", "tags": ["reader", null]}
            }),
        );
        save_slot
            .pointer_mut("/state/contexts/0/rollback/timeline/0")
            .expect("rollback checkpoint")
            .as_object_mut()
            .expect("rollback checkpoint object")
            .insert(
                "executedActions".to_string(),
                json!([{
                    "type": "pushOverlay",
                    "payload": {"resourceId": "menu"}
                }]),
            );
        *save_slot
            .pointer_mut("/state/contexts/0/rollback/replayStartIndex")
            .expect("rollback compatibility anchor") = json!(1);
        save_slot
            .as_object_mut()
            .expect("save-slot object")
            .insert("hostMetadata".to_string(), json!({"label": "Autosave"}));

        save_slots(&path, json!({"auto": save_slot.clone()})).expect("save named slot");

        assert_eq!(
            load(&path).expect("load named slot").save_slots,
            json!({"auto": save_slot})
        );
    }

    #[test]
    fn rejects_each_malformed_save_slot_shape() {
        let mut missing_state = valid_save_slot(json!(1), "line-1");
        missing_state
            .as_object_mut()
            .expect("save-slot object")
            .remove("state");

        let mut unknown_context_field = valid_save_slot(json!(1), "line-1");
        unknown_context_field
            .pointer_mut("/state/contexts/0")
            .expect("save context")
            .as_object_mut()
            .expect("save context object")
            .insert("pendingEffects".to_string(), json!([]));

        let mut incomplete_context_runtime = valid_save_slot(json!(1), "line-1");
        incomplete_context_runtime
            .pointer_mut("/state/contexts/0")
            .expect("save context")
            .as_object_mut()
            .expect("save context object")
            .insert("runtime".to_string(), json!({"saveLoadPagination": 1}));

        let mut invalid_rollback_action = valid_save_slot(json!(1), "line-1");
        invalid_rollback_action
            .pointer_mut("/state/contexts/0/rollback/timeline/0")
            .expect("rollback checkpoint")
            .as_object_mut()
            .expect("rollback checkpoint object")
            .insert(
                "executedActions".to_string(),
                json!([{"type": "", "payload": {}}]),
            );

        let malformed = vec![
            ("slot root", json!([]), "saveSlots:1 must be a JSON object"),
            (
                "format version",
                replace_save_slot_value(
                    valid_save_slot(json!(1), "line-1"),
                    "/formatVersion",
                    json!(2),
                ),
                "formatVersion must be 1",
            ),
            (
                "slot identity",
                replace_save_slot_value(valid_save_slot(json!(2), "line-1"), "/slotId", json!(2)),
                "slotId must match persistence key saveSlots:1",
            ),
            (
                "saved timestamp",
                replace_save_slot_value(
                    valid_save_slot(json!(1), "line-1"),
                    "/savedAt",
                    json!("today"),
                ),
                "savedAt must be a finite JSON number",
            ),
            (
                "thumbnail",
                replace_save_slot_value(valid_save_slot(json!(1), "line-1"), "/image", json!(42)),
                "image must be a JSON string",
            ),
            ("missing state", missing_state, "state is required"),
            (
                "empty contexts",
                replace_save_slot_value(
                    valid_save_slot(json!(1), "line-1"),
                    "/state/contexts",
                    json!([]),
                ),
                "contexts must not be empty",
            ),
            (
                "pointer mode",
                replace_save_slot_value(
                    valid_save_slot(json!(1), "line-1"),
                    "/state/contexts/0/currentPointerMode",
                    json!("history"),
                ),
                "currentPointerMode must be \"read\"",
            ),
            (
                "read pointer",
                replace_save_slot_value(
                    valid_save_slot(json!(1), "line-1"),
                    "/state/contexts/0/pointers/read/lineId",
                    json!(""),
                ),
                "lineId must be a non-empty JSON string",
            ),
            (
                "view entry",
                replace_save_slot_value(
                    valid_save_slot(json!(1), "line-1"),
                    "/state/contexts/0/views",
                    json!(["not-an-object"]),
                ),
                "views[0] must be a JSON object",
            ),
            (
                "configuration",
                replace_save_slot_value(
                    valid_save_slot(json!(1), "line-1"),
                    "/state/contexts/0/configuration",
                    json!([]),
                ),
                "configuration must be a JSON object",
            ),
            (
                "background music",
                replace_save_slot_value(
                    valid_save_slot(json!(1), "line-1"),
                    "/state/contexts/0/bgm",
                    json!({"resourceId": 42}),
                ),
                "bgm.resourceId must be a JSON string",
            ),
            (
                "variable value",
                replace_save_slot_value(
                    valid_save_slot(json!(1), "line-1"),
                    "/state/contexts/0/variables",
                    json!({"score": null}),
                ),
                "variables.score must be a JSON string, number, boolean, object, or array",
            ),
            (
                "context runtime",
                incomplete_context_runtime,
                "runtime.menuPage is required",
            ),
            (
                "rollback cursor",
                replace_save_slot_value(
                    valid_save_slot(json!(1), "line-1"),
                    "/state/contexts/0/rollback/currentIndex",
                    json!(4),
                ),
                "currentIndex must identify an entry",
            ),
            (
                "rollback pointer",
                replace_save_slot_value(
                    valid_save_slot(json!(1), "line-1"),
                    "/state/contexts/0/rollback/timeline/0/lineId",
                    json!("line-2"),
                ),
                "timeline[currentIndex] must match",
            ),
            (
                "rollback action",
                invalid_rollback_action,
                "executedActions[0].type must be a non-empty JSON string",
            ),
            (
                "unknown context state",
                unknown_context_field,
                "pendingEffects is not supported",
            ),
        ];

        for (case, value, expected_error) in malformed {
            let error = match validate_save_slot("1", &value, "Runtime persistence key saveSlots:1")
            {
                Ok(()) => panic!("{case} must be rejected"),
                Err(error) => error,
            };
            assert!(
                error.contains(expected_error),
                "{case}: expected {expected_error:?} in {error:?}"
            );
        }
    }

    #[test]
    fn rejects_unsupported_schema_without_resetting_it() {
        let (_directory, path) = database_path();
        let connection = Connection::open(&path).expect("open future database");
        connection
            .execute_batch("PRAGMA user_version = 2;")
            .expect("set future schema version");
        drop(connection);

        let error = load(&path).expect_err("reject future schema");
        assert!(error.contains("Unsupported runtime database schema version: 2"));

        let connection = Connection::open(&path).expect("reopen future database");
        let version = connection
            .query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))
            .expect("future schema version remains");
        assert_eq!(version, 2);
    }

    #[test]
    fn database_constraint_rejects_invalid_json() {
        let (_directory, path) = database_path();
        let connection = open_database(&path).expect("create database");
        let error = connection
            .execute(
                "INSERT INTO persistence_values (key, value_json, updated_at) VALUES (?1, ?2, ?3)",
                params!["saveSlots:1", "not-json", 1],
            )
            .expect_err("reject invalid persisted JSON");
        assert!(error.to_string().contains("CHECK constraint failed"));
        let row_count = connection
            .query_row("SELECT COUNT(*) FROM persistence_values", [], |row| {
                row.get::<_, i64>(0)
            })
            .expect("count persistence rows");
        assert_eq!(row_count, 0);
    }

    #[test]
    fn database_constraints_reject_unknown_keys_and_timestamps() {
        let (_directory, path) = database_path();
        let connection = open_database(&path).expect("create database");

        let unknown_key = connection
            .execute(
                "INSERT INTO persistence_values (key, value_json, updated_at) VALUES (?1, ?2, ?3)",
                params!["saveSlots:", "{}", 1],
            )
            .expect_err("reject empty save-slot suffix");
        assert!(unknown_key.to_string().contains("CHECK constraint failed"));

        let invalid_timestamp = connection
            .execute(
                "INSERT INTO persistence_values (key, value_json, updated_at) VALUES (?1, ?2, ?3)",
                params![GLOBAL_RUNTIME_KEY, "{}", -1],
            )
            .expect_err("reject negative update timestamp");
        assert!(
            invalid_timestamp
                .to_string()
                .contains("CHECK constraint failed")
        );
    }

    #[test]
    fn load_rejects_corrupt_json_without_replacing_the_stored_row() {
        let (_directory, path) = database_path();
        let connection = open_database(&path).expect("create database");
        connection
            .execute_batch("PRAGMA ignore_check_constraints = ON;")
            .expect("allow simulated database corruption");
        connection
            .execute(
                "INSERT INTO persistence_values (key, value_json, updated_at) VALUES (?1, ?2, ?3)",
                params!["saveSlots:1", "not-json", 1],
            )
            .expect("insert simulated corrupt JSON");
        connection
            .execute_batch("PRAGMA ignore_check_constraints = OFF;")
            .expect("restore database constraints");
        drop(connection);

        let error = load(&path).expect_err("reject invalid JSON");
        assert!(error.contains("contains invalid JSON"));

        let connection = Connection::open(&path).expect("reopen invalid database");
        let stored = connection
            .query_row(
                "SELECT value_json FROM persistence_values WHERE key = ?1",
                ["saveSlots:1"],
                |row| row.get::<_, String>(0),
            )
            .expect("invalid row remains");
        assert_eq!(stored, "not-json");
    }

    #[test]
    fn load_rejects_semantically_invalid_json_without_replacing_the_stored_row() {
        let (_directory, path) = database_path();
        let invalid_value = json!({"soundVolume": 101}).to_string();
        let connection = open_database(&path).expect("create database");
        connection
            .execute(
                "INSERT INTO persistence_values (key, value_json, updated_at) VALUES (?1, ?2, ?3)",
                params![GLOBAL_RUNTIME_KEY, invalid_value, 1],
            )
            .expect("insert syntactically valid but semantically invalid JSON");
        drop(connection);

        let error = load(&path).expect_err("reject invalid runtime value");
        assert!(error.contains("soundVolume must be between 0 and 100"));

        let connection = Connection::open(&path).expect("reopen invalid database");
        let stored = connection
            .query_row(
                "SELECT value_json FROM persistence_values WHERE key = ?1",
                [GLOBAL_RUNTIME_KEY],
                |row| row.get::<_, String>(0),
            )
            .expect("invalid row remains");
        assert_eq!(stored, json!({"soundVolume": 101}).to_string());
    }

    #[test]
    fn rejects_invalid_fixed_key_values_before_writing_rows() {
        let (_directory, path) = database_path();
        let malformed = [
            (
                GLOBAL_DEVICE_VARIABLES_KEY,
                json!({"score": null}),
                "globalDeviceVariables.score",
            ),
            (
                GLOBAL_ACCOUNT_VARIABLES_KEY,
                json!({"": true}),
                "empty variable ID",
            ),
            (
                GLOBAL_RUNTIME_KEY,
                json!([]),
                "globalRuntime must be a JSON object",
            ),
            (
                GLOBAL_RUNTIME_KEY,
                json!({"autoMode": true}),
                "globalRuntime.autoMode is not supported",
            ),
            (
                GLOBAL_RUNTIME_KEY,
                json!({"musicVolume": 101}),
                "musicVolume must be between 0 and 100",
            ),
            (
                ACCOUNT_VIEWED_REGISTRY_KEY,
                json!({"sections": [{"sectionId": ""}], "resources": []}),
                "sectionId must be a non-empty JSON string",
            ),
            (
                ACCOUNT_VIEWED_REGISTRY_KEY,
                json!({"sections": [], "resources": [{"resourceId": null}]}),
                "resourceId must be a non-empty JSON string",
            ),
        ];

        for (key, value, expected_error) in malformed {
            let error = save_value(&path, key, value).expect_err("reject invalid value");
            assert!(
                error.contains(expected_error),
                "expected {expected_error:?} in {error:?}"
            );
        }

        let connection = open_database(&path).expect("open validated database");
        let row_count = connection
            .query_row("SELECT COUNT(*) FROM persistence_values", [], |row| {
                row.get::<_, i64>(0)
            })
            .expect("count persistence rows");
        assert_eq!(row_count, 0);
    }

    #[test]
    fn persists_values_and_clear_deletes_all_runtime_rows() {
        let (_directory, path) = database_path();
        let expected = PlayerPersistenceState {
            save_slots: json!({"1": valid_save_slot(json!(1), "line-1")}),
            global_device_variables: json!({"textSpeed": 42}),
            global_account_variables: json!({"routeUnlocked": true}),
            global_runtime: json!({"skipUnseenText": false}),
            account_viewed_registry: json!({"sections": [], "resources": []}),
        };
        save_slots(&path, expected.save_slots.clone()).expect("save slots");
        save_value(
            &path,
            GLOBAL_DEVICE_VARIABLES_KEY,
            expected.global_device_variables.clone(),
        )
        .expect("save device variables");
        save_value(
            &path,
            GLOBAL_ACCOUNT_VARIABLES_KEY,
            expected.global_account_variables.clone(),
        )
        .expect("save account variables");
        save_value(&path, GLOBAL_RUNTIME_KEY, expected.global_runtime.clone())
            .expect("save runtime preferences");
        save_value(
            &path,
            ACCOUNT_VIEWED_REGISTRY_KEY,
            expected.account_viewed_registry.clone(),
        )
        .expect("save viewed registry");

        assert_eq!(load(&path).expect("load saved persistence"), expected);

        clear(&path).expect("clear persistence");
        let cleared = load(&path).expect("load cleared persistence");
        assert_eq!(cleared, PlayerPersistenceState::default());

        let connection = open_database(&path).expect("open cleared database");
        let row_count = connection
            .query_row("SELECT COUNT(*) FROM persistence_values", [], |row| {
                row.get::<_, i64>(0)
            })
            .expect("cleared row count");
        assert_eq!(row_count, 0);
    }

    #[test]
    fn stores_save_slots_by_key_without_rewriting_unchanged_slots() {
        let (_directory, path) = database_path();
        save_slots(
            &path,
            json!({
                "1": valid_save_slot(json!(1), "line-1"),
                "2": valid_save_slot(json!(2), "line-2")
            }),
        )
        .expect("save initial slots");

        let connection = open_database(&path).expect("open save-slot database");
        let stored_keys = {
            let mut statement = connection
                .prepare(
                    "SELECT key FROM persistence_values
                     WHERE substr(key, 1, ?1) = ?2
                     ORDER BY key",
                )
                .expect("prepare save-slot keys");
            statement
                .query_map(
                    params![SAVE_SLOT_KEY_PREFIX.len() as i64, SAVE_SLOT_KEY_PREFIX],
                    |row| row.get::<_, String>(0),
                )
                .expect("query save-slot keys")
                .collect::<Result<Vec<_>, _>>()
                .expect("collect save-slot keys")
        };
        assert_eq!(stored_keys, vec!["saveSlots:1", "saveSlots:2"]);
        connection
            .execute(
                "UPDATE persistence_values SET updated_at = 10 WHERE key = 'saveSlots:1'",
                [],
            )
            .expect("set slot 1 timestamp");
        connection
            .execute(
                "UPDATE persistence_values SET updated_at = 20 WHERE key = 'saveSlots:2'",
                [],
            )
            .expect("set slot 2 timestamp");
        drop(connection);

        save_slots(
            &path,
            json!({
                "1": valid_save_slot(json!(1), "line-1"),
                "2": valid_save_slot(json!(2), "line-3")
            }),
        )
        .expect("update one slot");

        let connection = open_database(&path).expect("reopen save-slot database");
        let slot_1_updated_at = connection
            .query_row(
                "SELECT updated_at FROM persistence_values WHERE key = 'saveSlots:1'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .expect("slot 1 timestamp");
        let slot_2_updated_at = connection
            .query_row(
                "SELECT updated_at FROM persistence_values WHERE key = 'saveSlots:2'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .expect("slot 2 timestamp");
        assert_eq!(slot_1_updated_at, 10);
        assert!(slot_2_updated_at > 20);
        drop(connection);

        save_slots(&path, json!({"1": valid_save_slot(json!(1), "line-1")}))
            .expect("delete missing slot");
        assert_eq!(
            load(&path).expect("load remaining slot").save_slots,
            json!({"1": valid_save_slot(json!(1), "line-1")})
        );
    }

    #[test]
    fn rejects_a_malformed_slot_snapshot_before_deleting_or_updating_any_slot() {
        let (_directory, path) = database_path();
        let original_slots = json!({
            "1": valid_save_slot(json!(1), "line-1"),
            "2": valid_save_slot(json!(2), "line-2")
        });
        save_slots(&path, original_slots.clone()).expect("save original slots");

        let connection = open_database(&path).expect("open save-slot database");
        connection
            .execute(
                "UPDATE persistence_values SET updated_at = 10 WHERE key = 'saveSlots:1'",
                [],
            )
            .expect("set slot 1 timestamp");
        connection
            .execute(
                "UPDATE persistence_values SET updated_at = 20 WHERE key = 'saveSlots:2'",
                [],
            )
            .expect("set slot 2 timestamp");
        drop(connection);

        let invalid_slot = replace_save_slot_value(
            valid_save_slot(json!(3), "line-3"),
            "/state/contexts/0/variables",
            json!({"score": null}),
        );
        let error = save_slots(
            &path,
            json!({
                "1": valid_save_slot(json!(1), "changed-line"),
                "3": invalid_slot
            }),
        )
        .expect_err("reject malformed slot snapshot");
        assert!(error.contains("saveSlots:3.state.contexts[0].variables.score"));

        assert_eq!(
            load(&path).expect("load original slots").save_slots,
            original_slots
        );
        let connection = open_database(&path).expect("reopen save-slot database");
        let timestamps = {
            let mut statement = connection
                .prepare(
                    "SELECT key, updated_at FROM persistence_values
                     WHERE key GLOB 'saveSlots:*' ORDER BY key",
                )
                .expect("prepare slot timestamps");
            statement
                .query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
                })
                .expect("query slot timestamps")
                .collect::<Result<Vec<_>, _>>()
                .expect("collect slot timestamps")
        };
        assert_eq!(
            timestamps,
            vec![
                ("saveSlots:1".to_string(), 10),
                ("saveSlots:2".to_string(), 20)
            ]
        );
    }

    #[test]
    fn applies_ordered_scoped_updates_transactionally() {
        let (_directory, path) = database_path();
        apply_scoped_data_updates(
            &path,
            vec![
                ScopedDataUpdate {
                    scope: "device".to_string(),
                    path: "variables.textSpeed".to_string(),
                    op: "set".to_string(),
                    value: json!(42),
                },
                ScopedDataUpdate {
                    scope: "account".to_string(),
                    path: "variables.routeUnlocked".to_string(),
                    op: "set".to_string(),
                    value: json!(true),
                },
                ScopedDataUpdate {
                    scope: "account".to_string(),
                    path: "viewedRegistry".to_string(),
                    op: "markViewed".to_string(),
                    value: json!({
                        "sections": [{"sectionId": "common", "lineId": "line2"}],
                        "resources": [{"resourceId": "cg-1"}]
                    }),
                },
                ScopedDataUpdate {
                    scope: "account".to_string(),
                    path: "viewedRegistry".to_string(),
                    op: "markViewed".to_string(),
                    value: json!({
                        "sections": [
                            {"sectionId": "common", "lineId": "line3"},
                            {"sectionId": "branch"}
                        ],
                        "resources": [{"resourceId": "cg-1"}, {"resourceId": "cg-2"}]
                    }),
                },
            ],
        )
        .expect("apply scoped updates");

        let persistence = load(&path).expect("load scoped values");
        assert_eq!(
            persistence.global_device_variables,
            json!({"textSpeed": 42})
        );
        assert_eq!(
            persistence.global_account_variables,
            json!({"routeUnlocked": true})
        );
        assert_eq!(
            persistence.account_viewed_registry,
            json!({
                "sections": [
                    {"sectionId": "common", "lastLineId": "line3"},
                    {"sectionId": "branch"}
                ],
                "resources": [{"resourceId": "cg-1"}, {"resourceId": "cg-2"}]
            })
        );
    }

    #[test]
    fn rejects_invalid_scoped_batch_without_partial_writes() {
        let (_directory, path) = database_path();
        let result = apply_scoped_data_updates(
            &path,
            vec![
                ScopedDataUpdate {
                    scope: "device".to_string(),
                    path: "variables.textSpeed".to_string(),
                    op: "set".to_string(),
                    value: json!(42),
                },
                ScopedDataUpdate {
                    scope: "device".to_string(),
                    path: "unsupported".to_string(),
                    op: "set".to_string(),
                    value: json!(true),
                },
            ],
        );

        assert!(result.is_err());
        assert_eq!(
            load(&path)
                .expect("load after rejected update")
                .global_device_variables,
            json!({})
        );
    }

    #[test]
    fn rejects_invalid_scoped_json_values_without_partial_writes() {
        let (_directory, path) = database_path();
        let null_variable_result = apply_scoped_data_updates(
            &path,
            vec![
                ScopedDataUpdate {
                    scope: "device".to_string(),
                    path: "variables.textSpeed".to_string(),
                    op: "set".to_string(),
                    value: json!(42),
                },
                ScopedDataUpdate {
                    scope: "account".to_string(),
                    path: "variables.routeUnlocked".to_string(),
                    op: "set".to_string(),
                    value: Value::Null,
                },
            ],
        );
        let error = null_variable_result.expect_err("reject null variable value");
        assert!(error.contains("updates[1].value must be a JSON string"));

        let malformed_registry_result = apply_scoped_data_updates(
            &path,
            vec![
                ScopedDataUpdate {
                    scope: "account".to_string(),
                    path: "variables.routeUnlocked".to_string(),
                    op: "set".to_string(),
                    value: json!(true),
                },
                ScopedDataUpdate {
                    scope: "account".to_string(),
                    path: "viewedRegistry".to_string(),
                    op: "markViewed".to_string(),
                    value: json!({
                        "sections": [{"sectionId": "", "lineId": "line-1"}]
                    }),
                },
            ],
        );
        let error = malformed_registry_result.expect_err("reject malformed viewed patch");
        assert!(error.contains("updates[1].value.sections[0].sectionId"));

        assert_eq!(
            load(&path).expect("load after rejected batches"),
            PlayerPersistenceState::default()
        );
    }
}
