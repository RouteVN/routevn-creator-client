
import { nanoid } from "nanoid";

export const handleOnMount = (deps) => {
  const { store, repository } = deps;
  const { colors } = repository.getState();
  store.setItems(colors);

  return () => {}
};


export const handleDataChanged = (e, deps) => {
  const { store, render, repository } = deps;
  const { colors } = repository.getState();
  store.setItems(colors);
  render();
};


export const handleColorItemClick = (e, deps) => {
  const { store, render } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);
  render();
};


export const handleColorCreated = (e, deps) => {
  const { store, render, repository } = deps;
  const { groupId, name, hex } = e.detail;

  repository.addAction({
    actionType: "treePush",
    target: "colors",
    value: {
      parent: groupId,
      position: "last",
      item: {
        id: nanoid(),
        type: "color",
        name: name,
        hex: hex,
      },
    },
  });

  const { colors } = repository.getState();
  store.setItems(colors);
  render();
};

export const handleColorEdited = (e, deps) => {
  const { store, render, repository, subject } = deps;
  const { itemId, name, hex } = e.detail;

  // Dispatch to app handlers for repository update
  subject.dispatch('update-color', {
    itemId,
    updates: {
      name,
      hex
    }
  });
};

export const handleColorUpdated = (e, deps) => {
  const { store, render, repository } = deps;
  
  // Get the currently selected item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    return;
  }
  
  // Update the color in the repository
  repository.addAction({
    actionType: "treeUpdate",
    target: "colors",
    value: {
      id: selectedItem.id,
      replace: false,
      item: {
        hex: e.detail.hex,
      },
    },
  });
  
  // Update the store with the new repository state
  const { colors } = repository.getState();
  store.setItems(colors);
  render();
};

export const handleFileAction = (e, deps) => {
  const { store, render, repository } = deps;
  const { value, newName } = e.detail;
  
  if (value === 'rename-item-confirmed') {
    // Get the currently selected item
    const selectedItem = store.selectSelectedItem();
    if (!selectedItem) {
      return;
    }
    
    // Update the item name in the repository
    repository.addAction({
      actionType: "treeUpdate",
      target: "colors",
      value: {
        id: selectedItem.id,
        replace: false,
        item: {
          name: newName,
        },
      },
    });
    
    // Update the store with the new repository state
    const { colors } = repository.getState();
    store.setItems(colors);
    render();
  }
};
