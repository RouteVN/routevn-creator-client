use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct Action {
    pub id: Option<i64>,
    pub action_type: String,
    pub target: Option<String>,
    pub value: Option<String>,
    pub created_at: Option<String>,
}

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
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action_type TEXT NOT NULL,
                target TEXT,
                value TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;
        
        conns.insert(project_path.to_string(), conn);
        Ok(())
    }

    pub fn close_project_db(&self, project_path: &str) -> Result<()> {
        let mut conns = self.connections.lock().unwrap();
        conns.remove(project_path);
        Ok(())
    }

    pub fn add_action(&self, project_path: &str, action: Action) -> Result<()> {
        let conns = self.connections.lock().unwrap();
        let conn = conns.get(project_path)
            .ok_or(rusqlite::Error::InvalidPath(PathBuf::from(project_path)))?;
        
        conn.execute(
            "INSERT INTO actions (action_type, target, value) VALUES (?1, ?2, ?3)",
            params![action.action_type, action.target, action.value],
        )?;
        
        Ok(())
    }

    pub fn get_all_events(&self, project_path: &str) -> Result<Vec<Action>> {
        let conns = self.connections.lock().unwrap();
        let conn = conns.get(project_path)
            .ok_or(rusqlite::Error::InvalidPath(PathBuf::from(project_path)))?;
        
        let mut stmt = conn.prepare(
            "SELECT id, action_type, target, value, created_at FROM actions ORDER BY id"
        )?;
        
        let action_iter = stmt.query_map([], |row| {
            Ok(Action {
                id: row.get(0)?,
                action_type: row.get(1)?,
                target: row.get(2)?,
                value: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;
        
        let mut actions = Vec::new();
        for action in action_iter {
            actions.push(action?);
        }
        
        Ok(actions)
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
pub async fn add_project_action(
    project_path: String,
    action: Action,
    state: State<'_, ProjectDbManager>
) -> std::result::Result<(), String> {
    state.add_action(&project_path, action)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_project_events(
    project_path: String,
    state: State<'_, ProjectDbManager>
) -> std::result::Result<Vec<Action>, String> {
    state.get_all_events(&project_path)
        .map_err(|e| e.to_string())
}