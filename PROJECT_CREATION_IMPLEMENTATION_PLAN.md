# Project Creation Feature Implementation Plan

## Architecture Design

### Data Storage Structure
```
AppData/
└── routevn-creator/
    ├── projects.db              # Project management database
    └── projects/
        ├── {projectId}/
        │   ├── project.db       # Project-specific SQLite database
        │   └── files/           # Project-specific file storage (flat structure)
        └── {projectId}/
            └── ...
```

### Database Schema

#### Projects Management Database (projects.db)
```sql
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    localPath TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    lastOpenedAt INTEGER
);
```

## Implementation Steps

### Phase 1: Project Management Infrastructure

#### 1.1 Create Project Management Service
**File:** `src/services/projectManager.js`

```javascript
export const createProjectManager = (deps) => {
    const { fs, path, sqlite } = deps;
    
    // Private state
    let projectsDbPath = null;
    let currentProjectId = null;
    let projectsDb = null;
    
    const initialize = async () => {
        // Create projects database if not exists
        // Load last opened project
        // Return current project ID
    };
    
    const createProject = async (projectData) => {
        // Generate project ID
        // Create project directory structure
        // Copy template resources
        // Create project SQLite database
        // Add to projects database
        // Return project info
    };
    
    const openProject = async (projectId) => {
        // Update currentProjectId
        // Update lastOpenedAt in database
        // Initialize project repository
        // Navigate to project view
    };
    
    const listProjects = async () => {
        // Query all projects from projects.db
        // Sort by lastOpenedAt
        // Return project list
    };
    
    const deleteProject = async (projectId) => {
        // Remove from projects database
        // Delete project directory
    };
    
    const getLastOpenedProject = async () => {
        // Query app_state for lastOpenedProjectId
        // Return project or null
    };
    
    return {
        initialize,
        createProject,
        openProject,
        listProjects,
        deleteProject,
        getLastOpenedProject
    };
};
```

#### 1.2 Update Repository Adapter
**File:** `src/deps/tauriRepositoryAdapter.js`

Modifications:
- Accept projectId in constructor
- Use project-specific database path
- Update file storage paths to include projectId

#### 1.3 Extend App Store for Project Management
**File:** `src/pages/app/app.store.js`

Add project-related state to the existing app store:
```javascript
// Add to INITIAL_STATE:
currentProjectId: null,
projects: [],

// Add new selectors and actions:
export const selectCurrentProject = (state) => {
    return state.projects.find(p => p.id === state.currentProjectId);
};

export const setCurrentProjectId = (state, projectId) => {
    state.currentProjectId = projectId;
};

export const setProjects = (state, projects) => {
    state.projects = projects;
};
```

### Phase 2: User Interface Components

#### 2.1 Project Creation Dialog
**Files:**
- `src/components/projectCreationDialog/projectCreationDialog.view.yaml`
- `src/components/projectCreationDialog/projectCreationDialog.store.js`
- `src/components/projectCreationDialog/projectCreationDialog.handlers.js`

Features:
- Form fields: name, description, icon picker, local path selector, template selector
- Validation for required fields
- Path selection using Tauri's dialog API

#### 2.2 Projects List Page
**Files:** Update existing `src/pages/projects/`

Features:
- List view of all projects
- Project cards showing: name, icon, description, last opened date
- Quick actions: Open, Delete
- "Create New Project" button


### Phase 3: Template System Extension

The template system is already implemented in `src/utils/templateProjectData.js` and `src/utils/templateSetup.js`. We need to extend it to support multiple templates.

#### 3.1 Extend Existing Template System
**File:** Update `src/utils/templateProjectData.js`

```javascript
// Instead of single template, export multiple templates
export const getTemplateData = (templateId) => {
    const templates = {
        'default': { /* existing template data */ },
        'template1': { /* template 1 */ },
        'template2': { /* template 2 */ }
    };
    return templates[templateId] || templates['default'];
};
```

### Phase 4: Application Lifecycle

#### 4.1 App Initialization Flow
**File:** Update `src/setup.tauri.js`

- Add ProjectManager initialization after dependencies setup
- Check for last opened project
- If no project exists, navigate to projects page
- Otherwise, load the last opened project

## Dependencies

### Required Tauri APIs
- `fs` - File system operations
- `path` - Path manipulation
- `dialog` - File/folder selection dialogs

## To Be Determined

### Back to project selector page
- In Browser we can change url to target page. But in app we need design a way to nav back.

### Database Architecture
- Whether to use a separate `projects.db` file or integrate with existing storage
- Whether to add an `app_state` table for persisting last opened project

### Router Updates
Need to determine how to handle project IDs in routes:
- Whether to use `/project/:projectId/...` pattern
- How to handle route guards for invalid project IDs
- Consider keeping current routes and storing projectId in app state instead
