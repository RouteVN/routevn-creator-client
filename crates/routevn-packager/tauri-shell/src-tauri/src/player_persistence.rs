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
const LEGACY_MIGRATION_KEY: &str = "legacyIndexedDbMigrationCompleted";

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
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE persistence_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

PRAGMA user_version = 1;

COMMIT;
"#;

type PersistenceResult<T> = Result<T, String>;

fn empty_object() -> Value {
    Value::Object(Map::new())
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlayerPersistenceState {
    #[serde(default = "empty_object")]
    save_slots: Value,
    #[serde(default = "empty_object")]
    global_device_variables: Value,
    #[serde(default = "empty_object")]
    global_account_variables: Value,
    #[serde(default = "empty_object")]
    global_runtime: Value,
    #[serde(default = "empty_object")]
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

impl PlayerPersistenceState {
    fn non_slot_entries(&self) -> [(&'static str, &Value); 4] {
        [
            (GLOBAL_DEVICE_VARIABLES_KEY, &self.global_device_variables),
            (GLOBAL_ACCOUNT_VARIABLES_KEY, &self.global_account_variables),
            (GLOBAL_RUNTIME_KEY, &self.global_runtime),
            (ACCOUNT_VIEWED_REGISTRY_KEY, &self.account_viewed_registry),
        ]
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlayerPersistenceLoadResult {
    persistence: PlayerPersistenceState,
    legacy_migration_completed: bool,
    has_native_values: bool,
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
    require_object(&value, &format!("Runtime persistence key {key}"))?;
    Ok(value)
}

fn upsert_persistence_value(
    connection: &Connection,
    key: &str,
    value: &Value,
    updated_at: i64,
) -> PersistenceResult<()> {
    validate_persistence_key(key)?;
    require_object(value, &format!("Runtime persistence key {key}"))?;
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
        require_object(&value, &format!("Runtime persistence key {key}"))?;
        save_slots.insert(slot_key.to_string(), value);
    }

    Ok(Value::Object(save_slots))
}

fn sync_save_slots(
    connection: &Connection,
    save_slots: &Value,
    updated_at: i64,
) -> PersistenceResult<()> {
    require_object(save_slots, "Runtime save slots")?;
    let save_slots = save_slots
        .as_object()
        .expect("validated runtime save-slot object");

    for (slot_key, value) in save_slots {
        save_slot_persistence_key(slot_key)?;
        require_object(value, &format!("Runtime save slot {slot_key}"))?;
    }

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

fn read_legacy_migration_completed(connection: &Connection) -> PersistenceResult<bool> {
    let value = connection
        .query_row(
            "SELECT value FROM persistence_metadata WHERE key = ?1",
            [LEGACY_MIGRATION_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("Failed to read legacy migration state: {error}"))?;

    match value.as_deref() {
        None => Ok(false),
        Some("1") => Ok(true),
        Some(value) => Err(format!("Invalid legacy migration state value: {value}")),
    }
}

fn load_from_connection(connection: &Connection) -> PersistenceResult<PlayerPersistenceLoadResult> {
    let native_value_count = connection
        .query_row("SELECT COUNT(*) FROM persistence_values", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|error| format!("Failed to inspect native persistence values: {error}"))?;

    Ok(PlayerPersistenceLoadResult {
        persistence: PlayerPersistenceState {
            save_slots: read_save_slots(connection)?,
            global_device_variables: read_persistence_value(
                connection,
                GLOBAL_DEVICE_VARIABLES_KEY,
            )?,
            global_account_variables: read_persistence_value(
                connection,
                GLOBAL_ACCOUNT_VARIABLES_KEY,
            )?,
            global_runtime: read_persistence_value(connection, GLOBAL_RUNTIME_KEY)?,
            account_viewed_registry: read_persistence_value(
                connection,
                ACCOUNT_VIEWED_REGISTRY_KEY,
            )?,
        },
        legacy_migration_completed: read_legacy_migration_completed(connection)?,
        has_native_values: native_value_count > 0,
    })
}

pub(crate) fn load(path: &Path) -> PersistenceResult<PlayerPersistenceLoadResult> {
    let connection = open_database(path)?;
    load_from_connection(&connection)
}

pub(crate) fn save_value(path: &Path, key: &str, value: Value) -> PersistenceResult<()> {
    if persistence_save_slot_key(key).is_some() {
        return Err("Runtime save slots must be written through the save-slot sync".to_string());
    }
    validate_persistence_key(key)?;
    require_object(&value, &format!("Runtime persistence key {key}"))?;
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
    require_object(&save_slots, "Runtime save slots")?;
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

pub(crate) fn complete_legacy_migration(
    path: &Path,
    legacy_state: PlayerPersistenceState,
) -> PersistenceResult<PlayerPersistenceLoadResult> {
    let mut connection = open_database(path)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| format!("Failed to begin legacy persistence import: {error}"))?;

    if !read_legacy_migration_completed(&transaction)? {
        let native_value_count = transaction
            .query_row("SELECT COUNT(*) FROM persistence_values", [], |row| {
                row.get::<_, i64>(0)
            })
            .map_err(|error| format!("Failed to inspect native persistence values: {error}"))?;

        if native_value_count == 0 {
            let updated_at = current_timestamp_ms()?;
            sync_save_slots(&transaction, &legacy_state.save_slots, updated_at)?;
            for (key, value) in legacy_state.non_slot_entries() {
                upsert_persistence_value(&transaction, key, value, updated_at)?;
            }
        }

        transaction
            .execute(
                "INSERT INTO persistence_metadata (key, value) VALUES (?1, '1')\n\
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [LEGACY_MIGRATION_KEY],
            )
            .map_err(|error| format!("Failed to record legacy persistence import: {error}"))?;
    }

    transaction
        .commit()
        .map_err(|error| format!("Failed to commit legacy persistence import: {error}"))?;
    load_from_connection(&connection)
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

    #[test]
    fn creates_empty_versioned_database() {
        let (_directory, path) = database_path();
        let loaded = load(&path).expect("load empty persistence");

        assert_eq!(loaded.persistence, PlayerPersistenceState::default());
        assert!(!loaded.legacy_migration_completed);
        assert!(!loaded.has_native_values);

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
    fn rejects_invalid_json_without_replacing_the_stored_row() {
        let (_directory, path) = database_path();
        let connection = open_database(&path).expect("create database");
        connection
            .execute(
                "INSERT INTO persistence_values (key, value_json, updated_at) VALUES (?1, ?2, ?3)",
                params!["saveSlots:1", "not-json", 1],
            )
            .expect("insert invalid persisted JSON");
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
    fn persists_values_and_clear_keeps_migration_marker() {
        let (_directory, path) = database_path();
        let legacy = PlayerPersistenceState {
            save_slots: json!({"1": {"slotId": 1}}),
            global_device_variables: json!({"textSpeed": 42}),
            global_account_variables: json!({"routeUnlocked": true}),
            global_runtime: json!({"skipUnseenText": false}),
            account_viewed_registry: json!({"sections": [], "resources": []}),
        };
        let imported = complete_legacy_migration(&path, legacy.clone()).expect("legacy import");

        assert_eq!(imported.persistence, legacy);
        assert!(imported.legacy_migration_completed);
        assert!(imported.has_native_values);

        save_value(&path, GLOBAL_RUNTIME_KEY, json!({"skipUnseenText": true}))
            .expect("save runtime value");
        assert_eq!(
            load(&path)
                .expect("load saved persistence")
                .persistence
                .global_runtime,
            json!({"skipUnseenText": true})
        );

        clear(&path).expect("clear persistence");
        let cleared = load(&path).expect("load cleared persistence");
        assert_eq!(cleared.persistence, PlayerPersistenceState::default());
        assert!(cleared.legacy_migration_completed);
        assert!(!cleared.has_native_values);
    }

    #[test]
    fn stores_save_slots_by_key_without_rewriting_unchanged_slots() {
        let (_directory, path) = database_path();
        save_slots(
            &path,
            json!({
                "1": {"slotId": 1, "state": {"lineId": "line-1"}},
                "2": {"slotId": 2, "state": {"lineId": "line-2"}}
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
                "1": {"slotId": 1, "state": {"lineId": "line-1"}},
                "2": {"slotId": 2, "state": {"lineId": "line-3"}}
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

        save_slots(
            &path,
            json!({"1": {"slotId": 1, "state": {"lineId": "line-1"}}}),
        )
        .expect("delete missing slot");
        assert_eq!(
            load(&path)
                .expect("load remaining slot")
                .persistence
                .save_slots,
            json!({"1": {"slotId": 1, "state": {"lineId": "line-1"}}})
        );
    }

    #[test]
    fn legacy_migration_never_overwrites_native_values() {
        let (_directory, path) = database_path();
        save_slots(
            &path,
            json!({"native": {"slotId": "native", "source": "native"}}),
        )
        .expect("native save");

        let imported = complete_legacy_migration(
            &path,
            PlayerPersistenceState {
                save_slots: json!({
                    "native": {"slotId": "native", "source": "legacy"}
                }),
                ..PlayerPersistenceState::default()
            },
        )
        .expect("complete migration");

        assert_eq!(
            imported.persistence.save_slots,
            json!({"native": {"slotId": "native", "source": "native"}})
        );
        assert!(imported.legacy_migration_completed);
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

        let persistence = load(&path).expect("load scoped values").persistence;
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
                .persistence
                .global_device_variables,
            json!({})
        );
    }
}
