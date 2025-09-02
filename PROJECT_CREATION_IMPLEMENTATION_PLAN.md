# Project Creation Feature Implementation Plan

## Architecture Design

### Data Storage Structure
```
AppData/
└── routevn-creator/
    └── app.db                   # Application database with key-value store

Projects/                        # User projects folder (outside AppData)
├── {projectId}/
│   ├── project.db              # Project-specific SQLite database
│   └── files/                  # Project-specific file storage (flat structure)
└── {projectId}/
    └── ...
```

### Database Schema

#### Application Database (app.db)
```sql
CREATE TABLE ItemTable (
    key TEXT PRIMARY KEY,
    value TEXT
);
```

Keys:
- `projects` - JSON array of project objects
- `lastOpenedProjectId` - ID of last opened project

## Implementation Steps

### Phase 1: Key-Value Store Infrastructure

#### 1.1 Create Key-Value Store Wrapper
**File:** `src/deps/keyValueStore.js`

```javascript
export const createKeyValueStore = (deps) => {
    const { sqlite } = deps;
    
    const get = async (key) => {
        // Query ItemTable for key
        // Parse JSON value if exists
        // Return parsed value or null
    };
    
    const set = async (key, value) => {
        // Stringify value to JSON
        // INSERT OR REPLACE into ItemTable
    };
    
    const initialize = async () => {
        // Create ItemTable if not exists
    };
    
    return { get, set, initialize };
};
```

#### 1.2 Project Operations Using Key-Value Store

Example usage in handlers:
```javascript
// Get projects
const projects = await kv.get('projects') || [];

// Add new project
projects.push(project);
await kv.set('projects', projects);

// Update last opened
await kv.set('lastOpenedProjectId', projectId);
```

### Phase 2: Projects Page

#### 2.1 Update Existing Projects Page
**Files:** Update existing `src/pages/projects/`

Features:
- List view of all projects from key-value store
- Project cards showing: name, description, last opened date
- Quick actions: Open, Delete, Create New
- Use key-value store directly in handlers

## Next Steps (To Be Implemented Later)

- Repository Adapter updates for project-specific paths
- App Store extensions for project management state
- Template system extensions for multiple templates
- Application lifecycle management
- Project creation dialog/flow
- Router updates for project context

## Dependencies

### Required Tauri APIs
- `fs` - File system operations
- `path` - Path manipulation
- `dialog` - File/folder selection dialogs
