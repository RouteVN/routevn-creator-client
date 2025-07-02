# Repository

> Currently this library only supports localStorage persistence. However we want to keep the same interface for other persistence methods in the future. In future it will be possible to store by sending ws to server, and support collaboration.

> For localStorage development, app may get very slow after too many actions. If this happens, you can clean up all localStorage and start over. We still need to optimize for this in future.

Event-sourced state management for hierarchical tree structures with localStorage persistence.

## Quick Start

```javascript
import { createRepository } from './src/deps/repository.js';

// Create repository with localStorage persistence
const repository = createRepository(
  { fileExplorer: { tree: [], items: {} } },
  'myApp-state'
);

// Add actions to modify state
repository.addAction({
  actionType: 'treePush',
  target: 'fileExplorer',
  value: {
    parent: '_root',
    item: { id: 'file1', name: 'Document.txt', type: 'file' },
    position: 'first'
  }
});

// Get current state
const state = repository.getState();
```

## Basic Operations

Use these operations for primitive values (strings, numbers, booleans) and simple objects.

### Set Values
Updates values at nested paths in the state. Supports both simple assignment and object merging.

```javascript
// Simple assignment - replaces the value completely
repository.addAction({
  actionType: 'set',
  target: 'user.name',
  value: 'John'
});

// Merge objects - combines new properties with existing ones
repository.addAction({
  actionType: 'set',
  target: 'user.profile',
  value: { replace: false, item: { age: 25 } }
});
```

### Remove Values
Deletes properties from the state at the specified path.

```javascript
repository.addAction({
  actionType: 'unset',
  target: 'user.temporaryData'
});
```

## Tree Operations

Use tree operations for any array representation and hierarchical data structures like file explorers, folder trees, or ordered lists. The tree structure separates hierarchy (`tree`) from item data (`items`).

### Add Items
Inserts new items into the tree at specified positions. The item data is stored separately from the tree structure.

```javascript
repository.addAction({
  actionType: 'treePush',
  target: 'fileExplorer',
  value: {
    parent: '_root', // or specific parent ID
    item: { id: 'newFile', name: 'New File', type: 'file' },
    position: 'first' // 'first', 'last', {after: 'id'}, {before: 'id'}
  }
});
```

### Update Items
Modifies the data properties of existing tree items without changing their position in the hierarchy.

```javascript
repository.addAction({
  actionType: 'treeUpdate',
  target: 'fileExplorer',
  value: {
    id: 'file1',
    replace: false, // merge with existing properties
    item: { name: 'Updated Name' }
  }
});
```

### Move Items
Relocates items to different positions in the tree hierarchy, including moving between parent folders.

```javascript
repository.addAction({
  actionType: 'treeMove',
  target: 'fileExplorer',
  value: {
    id: 'file1',
    parent: '_root',
    position: { after: 'folder1' }
  }
});
```

### Delete Items
Removes items completely from both the tree structure and item data storage.

```javascript
repository.addAction({
  actionType: 'treeDelete',
  target: 'fileExplorer',
  value: { id: 'fileToDelete' }
});
```

## Utility Functions

### Flatten Tree to List
Converts the hierarchical tree structure into a flat array while preserving hierarchy information. Useful for rendering lists or tables from tree data.

```javascript
import { toFlatItems } from './src/deps/repository.js';

const flatItems = toFlatItems(state.fileExplorer);
// Returns flat array with _level, fullLabel, hasChildren, parentId
```

### Group by Folders
Transforms tree data into folder groups where each folder contains its direct children. Useful for grouped views or accordion-style interfaces.

```javascript
import { toFlatGroups } from './src/deps/repository.js';

const groups = toFlatGroups(state.fileExplorer);
// Returns folder groups with their children
```

## Persistence

When you provide a `localStorageKey`, the repository automatically saves to localStorage every 5 seconds and restores on initialization.

```javascript
const repository = createRepository(initialState, 'my-app-key');
```