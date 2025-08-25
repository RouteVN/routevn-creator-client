# Proposals for Handling Sub-Resource Menu Selection


### Proposal 1: Directly Modify `selectedResourceId` (Recommended)

This approach involves changing the `selectedResourceId` in the store of each sub-page to match its parent's resource ID.

Changes:

```javascript
// characterSprites.store.js
selectedResourceId: "characters"  // Change from "character-sprites" to "characters"

// layoutEditor.store.js  
selectedResourceId: "layouts"  // Change from "layout-editor" to "layouts"
```

Pros:

  * The most simple and direct solution.
  * Requires minimal code changes.
  * Keeps the selection logic consistent with existing resource definitions.

Cons:

  * Semantically imprecise, as the sub-page's ID doesn't perfectly match the `selectedResourceId`.

-----

### Proposal 2: Add New Resource Items

This solution involves adding new, distinct resource items for the sub-pages in `resourceTypes.store.js`. These can optionally be hidden from the UI.

Changes:

```javascript
// resourceTypes.store.js
export const assetItems = [
  // ... existing items
  {
    id: "characters",
    name: "Characters",
    path: "/project/resources/characters",
  },
  {
    id: "character-sprites",  // New item
    name: "Character Sprites",
    path: "/project/resources/character-sprites",
    hidden: true  // Optional: hide from the menu
  },
  // ...
];

export const userInterfaceItems = [
  // ... existing items
  {
    id: "layouts",
    name: "Layouts",
    path: "/project/resources/layouts",
  },
  {
    id: "layout-editor",  // New item
    name: "Layout Editor",
    path: "/project/resources/layout-editor",
    hidden: true  // Optional: hide from the menu
  },
  // ...
];
```

Pros:

  * Preserves existing page store logic without changes.
  * More semantically accurate, as each page has a corresponding resource item.

Cons:

  * May display duplicate menu items unless specific logic is added to handle the `hidden` property.
  * Requires more code modifications overall.

-----

### Proposal 3: Implement Smart Matching Logic

This approach centralizes the logic by modifying the `toViewData` function to handle special cases, mapping sub-page IDs to their parent IDs.

Changes:

```javascript
// In toViewData function within resourceTypes.store.js
export const toViewData = ({ props }) => {
  const { resourceCategory, selectedResourceId } = props;
  const resourceItems = resourceCategoryNames[resourceCategory].resources;

  const items = resourceItems.map((item) => {
    // Start with a direct match
    let isSelected = selectedResourceId === item.id;

    // Apply special matching rules for sub-pages
    if (!isSelected) {
      if (item.id === "characters" && selectedResourceId === "character-sprites") {
        isSelected = true;
      } else if (item.id === "layouts" && selectedResourceId === "layout-editor") {
        isSelected = true;
      }
    }

    return {
      id: item.id,
      name: item.name,
      path: item.path,
      bgc: isSelected ? "mu" : "bg",
    };
  });

  return {
    label: resourceCategoryNames[resourceCategory].label,
    items,
  };
};
```

Pros:

  * Avoids modifications to individual page stores.
  * Centralizes the handling of exceptions.
  * Maintains backward compatibility.

Cons:

  * Introduces hardcoded, special-case logic into the `resourceTypes` store, which can be difficult to maintain.

-----

### Proposal 4: Use a Parent ID Map

This solution introduces a mapping configuration to define parent-child relationships. The `toViewData` function uses this map to determine the correct item to highlight.

Changes:

```javascript
// resourceTypes.store.js
const resourceParentMapping = {
  "character-sprites": "characters",
  "layout-editor": "layouts",
};

export const toViewData = ({ props }) => {
  const { resourceCategory, selectedResourceId } = props;

  // Find the actual ID to highlight using the map
  const actualSelectedId = resourceParentMapping[selectedResourceId] || selectedResourceId;

  const resourceItems = resourceCategoryNames[resourceCategory].resources;

  const items = resourceItems.map((item) => {
    const isSelected = actualSelectedId === item.id;
    return {
      id: item.id,
      name: item.name,
      path: item.path,
      bgc: isSelected ? "mu" : "bg",
    };
  });

  return {
    label: resourceCategoryNames[resourceCategory].label,
    items,
  };
};
```

Pros:

  * The configuration is clean and easy to maintain.
  * Easily extensible for new parent-child relationships.
  * Does not require changes to individual page stores.

Cons:

  * Adds the overhead of maintaining a separate mapping object.