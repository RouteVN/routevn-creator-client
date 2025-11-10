---
title: migrate insieme
status: done
priority: low
---

# Description

Look at:

https://raw.githubusercontent.com/yuusoft-org/insieme/refs/heads/main/README.md

we want to migrate current src/deps/repository.js to use insieme. so we need to wrap it around a factory function to get the right project.

a lot of API has changed we need to plan all the necessary changes

# Implementation plan

## Current System Analysis

The current `src/deps/repository.js` implements:
- **State Management**: Custom event sourcing with checkpointing every 50 actions
- **Tree Operations**: Full tree CRUD (push, delete, update, move, copy) with custom logic
- **Factory Pattern**: Multi-project support with `getByProject()` and `getByPath()` methods
- **Storage**: Tauri SQLite adapter via `createTauriSQLiteRepositoryAdapter` + web version
- **Utilities**: Tree conversion functions (`toFlatItems`, `toTreeStructure`, `toFlatGroups`)

### Key Components to Migrate
1. **Core Functions**: `set`, `unset`, `get` - state property manipulation
2. **Tree Functions**: `treePush`, `treeDelete`, `treeUpdate`, `treeMove`, `treeCopy`
3. **Factory Functions**: `createRepositoryFactory`, `createWebRepositoryFactory`
4. **Repository Core**: `createRepositoryInternal` - state management and checkpointing
5. **Utility Functions**: `toFlatItems`, `toFlatGroups`, `toTreeStructure`

## Insieme Integration Benefits

Insieme provides built-in support for:
- ✅ Event-based state management and synchronization
- ✅ Tree operations (`treePush`, `treeDelete`, `treeUpdate`, `treeMove`)
- ✅ Offline-first functionality with optimistic UIs
- ✅ Central server validation and conflict resolution
- ✅ Swappable storage adapters
- ✅ Checkpointing and performance optimization

## Migration Strategy

### Phase 1: Factory Pattern Migration

**Current Factory Pattern:**
```javascript
// Current Tauri factory
export const createRepositoryFactory = (initialState, keyValueStore) => {
  const repositoriesByProject = new Map();
  const repositoriesByPath = new Map();

  const getOrCreateRepositoryByPath = async (projectPath) => {
    if (repositoriesByPath.has(projectPath)) {
      return repositoriesByPath.get(projectPath);
    }

    const store = await createTauriSQLiteRepositoryAdapter(projectPath);
    const repository = createRepositoryInternal(initialState, store);
    await repository.init();
    repositoriesByPath.set(projectPath, repository);
    return repository;
  };

  return {
    getByProject: async (projectId) => { /* ... */ },
    getByPath: async (projectPath) => { /* ... */ },
  };
};
```

**New Insieme-Based Factory:**
```javascript
import { createRepository } from "insieme";

export const createRepositoryFactory = (keyValueStore) => {
  const repositoriesByProject = new Map();
  const repositoriesByPath = new Map();

  const getOrCreateRepositoryByPath = async (projectPath) => {
    if (repositoriesByPath.has(projectPath)) {
      return repositoriesByPath.get(projectPath);
    }

    // Create insieme-compatible store adapter for the project path
    const store = await createInsiemeTauriStoreAdapter(projectPath);

    // Create insieme repository
    const repository = createRepository({ originStore: store });

    // Initialize with project-specific initial state if needed
    const projects = (await keyValueStore.get("projects")) || [];
    const project = projects.find(p => p.projectPath === projectPath);
    const initialState = project?.initialState || {};

    await repository.init({ initialState });

    repositoriesByPath.set(projectPath, repository);
    return repository;
  };

  return {
    getByProject: async (projectId) => {
      if (repositoriesByProject.has(projectId)) {
        return repositoriesByProject.get(projectId);
      }

      const projects = (await keyValueStore.get("projects")) || [];
      const project = projects.find(p => p.id === projectId);
      if (!project) {
        throw new Error("project not found");
      }

      const repository = await getOrCreateRepositoryByPath(project.projectPath);
      repositoriesByProject.set(projectId, repository);
      return repository;
    },

    getByPath: getOrCreateRepositoryByPath,
  };
};
```

**Web Factory Migration:**
```javascript
export const createWebRepositoryFactory = (initialState) => {
  let repository = null;

  return {
    async getByProject(_projectId) {
      if (!repository) {
        // Use appropriate web store (localStorage, IndexedDB, etc.)
        const store = createWebStore(); // Need to implement
        repository = createRepository({ originStore: store });
        await repository.init({ initialState });
      }
      return repository;
    },
  };
};
```

### Phase 2: Core Operations Removal

**Remove All Custom State Management Functions:**
```javascript
// DELETE these functions - let users call repository.addEvent() directly:
// - set, unset, get (state property functions)
// - treePush, treeDelete, treeUpdate, treeMove, treeCopy (tree manipulation functions)
// - findNodeInTree, removeNodeFromTree (tree helper functions)

// Users will now call directly:
await repository.addEvent({
  type: "set",
  payload: { path: "user.name", value: "John" }
});

await repository.addEvent({
  type: "treePush",
  payload: { target: "fileExplorer", parent: "_root", item: {...}, position: "last" }
});
```

### Phase 3: Repository Core Removal

**Remove These Functions (handled by insieme):**
- `createRepositoryInternal` - replaced by `createRepository`
- `applyActionToState` - handled internally by insieme
- `init` - replaced by `repository.init()`
- `addAction` - replaced by `repository.addEvent()`
- `getState` - replaced by `repository.getState()`
- Checkpointing logic - handled automatically by insieme
- Event streaming/caching - managed by insieme

**Repository Factory Simplified:**
```javascript
// Return insieme repository directly - no wrapper needed
export const createRepositoryFactory = (keyValueStore) => {
  const repositoriesByProject = new Map();
  const repositoriesByPath = new Map();

  const getOrCreateRepositoryByPath = async (projectPath) => {
    if (repositoriesByPath.has(projectPath)) {
      return repositoriesByPath.get(projectPath);
    }

    const store = await createInsiemeTauriStoreAdapter(projectPath);
    const repository = createRepository({ originStore: store });

    const projects = (await keyValueStore.get("projects")) || [];
    const project = projects.find(p => p.projectPath === projectPath);
    const initialState = project?.initialState || {};

    await repository.init({ initialState });

    repositoriesByPath.set(projectPath, repository);
    return repository; // Return insieme repository directly
  };

  return {
    getByProject: async (projectId) => {
      if (repositoriesByProject.has(projectId)) {
        return repositoriesByProject.get(projectId);
      }

      const projects = (await keyValueStore.get("projects")) || [];
      const project = projects.find(p => p.id === projectId);
      if (!project) {
        throw new Error("project not found");
      }

      const repository = await getOrCreateRepositoryByPath(project.projectPath);
      repositoriesByProject.set(projectId, repository);
      return repository;
    },

    getByPath: getOrCreateRepositoryByPath,
  };
};
```

### Phase 4: Utility Functions Preservation

removed

### Phase 5: Store Adapter Adaptation

**Current Store API (to be adapted):**
```javascript
// Current Tauri adapter interface
{
  async addAction(action) { /* ... */ },
  async getAllEvents() { /* ... */ },
  app: {
    get: async (key) => { /* ... */ },
    set: async (key, value) => { /* ... */ },
    remove: async (key) => { /* ... */ },
  }
}
```

**Insieme Store API Requirements:**
```javascript
// Insieme expects this interface
{
  async getEvents() { return []; },
  async appendEvent(event) { /* ... */ },
}
```

**Adapted Tauri Store Adapter:**
```javascript
export const createInsiemeTauriStoreAdapter = async (projectPath) => {
  if (!projectPath) {
    throw new Error("Project path is required. Database must be stored in project folder.");
  }

  const dbPath = await join(projectPath, "repository.db");
  const db = await Database.load(`sqlite:${dbPath}`);

  await db.execute(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    payload TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS app (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  return {
    // Insieme store interface
    async getEvents() {
      const results = await db.select(
        "SELECT type, payload FROM events ORDER BY id"
      );
      return results.map((row) => ({
        type: row.type,
        payload: row.payload ? JSON.parse(row.payload) : null,
      }));
    },

    async appendEvent(event) {
      await db.execute(
        "INSERT INTO events (type, payload) VALUES (?, ?)",
        [event.type, JSON.stringify(event.payload)]
      );
    },

    // Preserve app methods for compatibility
    app: {
      get: async (key) => {
        const result = await db.select("SELECT value FROM app WHERE key = $1", [key]);
        if (result && result.length > 0) {
          try {
            return JSON.parse(result[0].value);
          } catch {
            return result[0].value;
          }
        }
        return null;
      },
      set: async (key, value) => {
        const jsonValue = JSON.stringify(value);
        await db.execute(
          "INSERT OR REPLACE INTO app (key, value) VALUES ($1, $2)",
          [key, jsonValue]
        );
      },
      remove: async (key) => {
        await db.execute("DELETE FROM app WHERE key = $1", [key]);
      },
    },
  };
};
```

### Phase 6: Dependencies and Imports

**New Dependencies:**
```json
{
  "dependencies": {
    "insieme": "^latest"
  }
}
```

**Import Changes:**
```javascript
// Updated imports for insieme integration
import { createRepository } from "insieme";
import { createInsiemeTauriStoreAdapter } from "./tauriRepositoryAdapter";
```

## Migration Checklist

### Store Adapter Updates
- [ ] Create `createInsiemeTauriStoreAdapter` with new interface
- [ ] Update database schema to use "events" table instead of "actions"
- [ ] Remove old `createTauriSQLiteRepositoryAdapter` function

### Repository Core Migration
- [ ] Install insieme package
- [ ] Update factory functions to use insieme
- [ ] Remove ALL custom state management functions (set, unset, tree operations, etc)
- [ ] Remove createRepositoryInternal and related checkpointing code

### App Code Migration - API Updates
- [ ] Update `repository.addAction()` calls to `repository.addEvent()` in `src/pages/app/app.handlers.js`
- [ ] Update action format: `{actionType, target, value}` → `{type, payload}`
- [ ] Update `src/pages/app/app.store.js` if it contains direct repository calls
- [ ] Test all app functionality with new API

**Migration Pattern:**
```javascript
// Before
await repository.addAction({
  actionType: "set",
  target: "settings.theme",
  value: "dark"
});

// After
await repository.addEvent({
  type: "set",
  payload: {
    path: "settings.theme",
    value: "dark"
  }
});

// Tree operations example
// Before
await repository.addAction({
  actionType: "treePush",
  target: "fileExplorer",
  value: {
    parent: "_root",
    item: { id: "folder1", name: "New Folder", type: "folder" },
    position: "last"
  }
});

// After
await repository.addEvent({
  type: "treePush",
  payload: {
    target: "fileExplorer",
    value: { id: "folder1", name: "New Folder", type: "folder" },
    options: { parent: "_root", position: "last" }
  }
});

// All action types migration examples:

// set action
// Before
await repository.addAction({
  actionType: "set",
  target: "settings.theme",
  value: "dark"
});
// After
await repository.addEvent({
  type: "set",
  payload: {
    target: "settings.theme",
    value: "dark"
  }
});

// unset action
// Before
await repository.addAction({
  actionType: "unset",
  target: "settings.theme"
});
// After
await repository.addEvent({
  type: "unset",
  payload: {
    target: "settings.theme"
  }
});

// treePush action
// Before
await repository.addAction({
  actionType: "treePush",
  target: "explorer",
  value: {
    parent: "_root",
    item: { id: "folder1", name: "New Folder", type: "folder" },
    position: "last"
  }
});
// After
await repository.addEvent({
  type: "treePush",
  payload: {
    target: "explorer",
    value: { id: "folder1", name: "New Folder", type: "folder" },
    options: { parent: "_root", position: "last" }
  }
});

// treeDelete action
// Before
await repository.addAction({
  actionType: "treeDelete",
  target: "explorer",
  value: { id: "folder1" }
});
// After
await repository.addEvent({
  type: "treeDelete",
  payload: {
    target: "explorer",
    value: { id: "folder1" }
  }
});

// treeUpdate action
// Before
await repository.addAction({
  actionType: "treeUpdate",
  target: "explorer",
  value: {
    id: "folder1",
    item: { name: "Updated Folder" },
    replace: false
  }
});
// After
await repository.addEvent({
  type: "treeUpdate",
  payload: {
    target: "explorer",
    value: {
      name: "Updated Folder"
    },
    options: {
      id: "folder1",
      replace: false
    }
  }
});

// treeMove action
// Before
await repository.addAction({
  actionType: "treeMove",
  target: "explorer",
  value: {
    id: "folder1",
    parent: "_root",
    position: "first"
  }
});
// After
await repository.addEvent({
  type: "treeMove",
  payload: {
    target: "explorer",
    value: { id: "folder1" },
    options: { parent: "_root", position: "first" }
  }
});
```

### Utility Functions & Testing
- [ ] Preserve utility functions (toFlatItems, toTreeStructure, etc)
- [ ] Test multi-project functionality
- [ ] Verify web/Tauri compatibility
- [ ] Test tree operations
- [ ] Performance testing
- [ ] Documentation update


## Expected Benefits

1. **Code Reduction**: ~400 lines of custom state management code removed
2. **Maintainability**: Complex synchronization logic handled by insieme
3. **Performance**: Built-in optimization and checkpointing
4. **Reliability**: Battle-tested conflict resolution
5. **Future-Proof**: Collaborative features ready for multi-client sync







