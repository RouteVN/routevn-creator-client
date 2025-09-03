use rusqlite::{Connection, Result};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

pub struct ProjectDbManager {
    connections: Mutex<HashMap<String, Connection>>,
}

impl ProjectDbManager {
    pub fn new() -> Self {
        ProjectDbManager {
            connections: Mutex::new(HashMap::new()),
        }
    }

    pub fn open_project_db(&self, project_path: &str) -> Result<()> {
        let mut conns = self.connections.lock().unwrap();
        
        if conns.contains_key(project_path) {
            return Ok(());
        }

        let db_path = PathBuf::from(project_path).join("repository.db");
        
        std::fs::create_dir_all(project_path).ok();
        
        let conn = Connection::open(db_path)?;
        
        conns.insert(project_path.to_string(), conn);
        Ok(())
    }

    pub fn close_project_db(&self, project_path: &str) -> Result<()> {
        let mut conns = self.connections.lock().unwrap();
        conns.remove(project_path);
        Ok(())
    }

    pub fn execute_sql(&self, project_path: &str, sql: &str, params: Vec<Value>) -> Result<()> {
        let conns = self.connections.lock().unwrap();
        let conn = conns.get(project_path)
            .ok_or(rusqlite::Error::InvalidPath(PathBuf::from(project_path)))?;
        
        let params: Vec<_> = params.iter().map(|v| v.to_string()).collect();
        conn.execute(sql, rusqlite::params_from_iter(params))?;
        
        Ok(())
    }

    pub fn query_sql(&self, project_path: &str, sql: &str, params: Vec<Value>) -> Result<Vec<HashMap<String, Value>>> {
        let conns = self.connections.lock().unwrap();
        let conn = conns.get(project_path)
            .ok_or(rusqlite::Error::InvalidPath(PathBuf::from(project_path)))?;
        
        let params: Vec<_> = params.iter().map(|v| v.to_string()).collect();
        let mut stmt = conn.prepare(sql)?;
        
        let column_count = stmt.column_count();
        let column_names: Vec<String> = (0..column_count)
            .map(|i| stmt.column_name(i).unwrap().to_string())
            .collect();
        
        let rows = stmt.query_map(rusqlite::params_from_iter(params), |row| {
            let mut result = HashMap::new();
            for (i, name) in column_names.iter().enumerate() {
                let value: Option<String> = row.get(i)?;
                result.insert(name.clone(), value.map_or(Value::Null, |v| Value::String(v)));
            }
            Ok(result)
        })?;
        
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        
        Ok(results)
    }
}

#[tauri::command]
pub async fn open_project_db(
    project_path: String,
    state: State<'_, ProjectDbManager>
) -> std::result::Result<(), String> {
    state.open_project_db(&project_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn close_project_db(
    project_path: String,
    state: State<'_, ProjectDbManager>
) -> std::result::Result<(), String> {
    state.close_project_db(&project_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn execute_project_sql(
    project_path: String,
    sql: String,
    params: Vec<Value>,
    state: State<'_, ProjectDbManager>
) -> std::result::Result<(), String> {
    state.execute_sql(&project_path, &sql, params)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn query_project_sql(
    project_path: String,
    sql: String,
    params: Vec<Value>,
    state: State<'_, ProjectDbManager>
) -> std::result::Result<Vec<HashMap<String, Value>>, String> {
    state.query_sql(&project_path, &sql, params)
        .map_err(|e| e.to_string())
}