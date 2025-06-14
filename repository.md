# Repository Pattern Specification

## Overview

This repository implements an event-sourcing pattern for state management with action streams. The core concept is that all state changes are represented as actions, and the current state is computed by replaying all actions from an initial state.

## Core Functions

### `createRepository(initialState, initialActionStreams)`

Creates a repository instance that manages state through action streams.

**Returns:**
- `addAction(action)`: Adds a new action to the stream
- `getState()`: Computes current state by replaying all actions

### `set(state, path, value)`

Immutably sets a value at a nested path in the state object.

**Parameters:**
- `state`: The current state object
- `path`: Dot-notation path (e.g., "project.name")
- `value`: The value to set

### `get(state, path)`

Retrieves a value from a nested path in the state object.

**Parameters:**
- `state`: The state object
- `path`: Dot-notation path

### `toFlatItems(data)`

Converts a tree structure with separate items and tree definitions into a flat array with level information.

**Input Format:**
```javascript
{
  items: {
    [id]: { ...itemData }
  },
  tree: [
    {
      id: string,
      children: []
    }
  ]
}
```

**Output Format:**
```javascript
[
  {
    ...itemData,
    id: string,
    _level: number
  }
]
```

## Action Types

### 1. `set`
Updates a value at a specific path.

```javascript
{
  actionType: 'set',
  target: 'project.name',
  value: 'New Name'
}
```

### 2. `treePush` (Documented but not implemented)
Insert item at end of node children.

```javascript
{
  actionType: 'treePush',
  target: 'images',
  value: {
    parent: '_root' | 'parentId',
    item: { id: 'newItem', ... }
  }
}
```

### 3. `treeDelete` (Documented but not implemented)
Delete an item from the tree.

```javascript
{
  actionType: 'treeDelete',
  target: 'images',
  value: {
    id: 'image1'
  }
}
```

### 4. `treeUpdate` (Documented but not implemented)
Update an existing item in the tree.

```javascript
{
  actionType: 'treeUpdate',
  target: 'images',
  value: {
    id: 'image1',
    replace: false, // if true, full replace of item
    item: { ...updates }
  }
}
```

### 5. `treeMove` (Documented but not implemented)
Move an item within the tree structure.

```javascript
{
  actionType: 'treeMove',
  target: 'images',
  value: {
    id: 'image1',
    parent: '_root' | 'parentId',
    previousSibling: 'image2' | undefined // if undefined, becomes first child
  }
}
```

## Data Structure

The repository works with nested data structures containing both flat items and tree relationships:

```javascript
{
  project: {
    name: string,
    description: string
  },
  [resourceType]: {
    items: {
      [id]: { ...itemProperties }
    },
    tree: [
      {
        id: string,
        children: [...nested items]
      }
    ]
  }
}
```

## Implementation Status & Notes

### Currently Implemented
- `set`: Updates values at nested paths

### Planned Implementations
1. **Tree Manipulation Actions**: `treePush`, `treeDelete`, `treeUpdate`, `treeMove` will be implemented later

2. **Error Handling**: Validation for invalid paths and missing targets will be added

3. **Tree Integrity**: Validation to ensure tree references point to existing items will be implemented

4. **Action Validation**: Structure and required field validation will be added

5. **Undo/Redo**: The action stream architecture supports this functionality; implementation pending

### Design Decisions
1. **Data Types**: Repository only handles raw JSON object types (no functions, dates, or other native JS types)

2. **Performance**: `getState()` replays all actions each time. For large action streams, optimization strategies may be needed (e.g., snapshots, memoization)

