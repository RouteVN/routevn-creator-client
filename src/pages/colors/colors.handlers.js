import { nanoid } from "nanoid";

export const handleBeforeMount = (deps) => {
  const { store, repository } = deps;
  const { colors } = repository.getState();
  store.setItems(colors);

  return () => {};
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
  subject.dispatch("update-color", {
    itemId,
    updates: {
      name,
      hex,
    },
  });
};

export const handleFormChange = (e, deps) => {
  const { repository, render, store } = deps;
  repository.addAction({
    actionType: "treeUpdate",
    target: "colors",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: {
        [e.detail.name]: e.detail.fieldValue,
      },
    },
  });

  const { colors } = repository.getState();
  store.setItems(colors);
  render();
};

export const handleColorItemDoubleClick = (e, deps) => {
  const { store, render } = deps;
  const { itemId } = e.detail;
  store.openEditDialog(itemId);
  render();
};

export const handleAddColorClick = (e, deps) => {
  const { store, render } = deps;
  const { groupId } = e.detail;
  store.openAddDialog(groupId);
  render();
};

export const handleEditDialogClose = (e, deps) => {
  const { store, render } = deps;
  store.closeEditDialog();
  render();
};

export const handleEditFormAction = (e, deps) => {
  const { store, render, repository } = deps;

  if (e.detail.actionId === "submit") {
    const formData = e.detail.formValues;

    // Update the color in the repository
    repository.addAction({
      actionType: "treeUpdate",
      target: "colors",
      value: {
        id: store.getState().editItemId,
        replace: false,
        item: {
          name: formData.name,
          hex: formData.hex,
        },
      },
    });

    const { colors } = repository.getState();
    store.setItems(colors);
    store.closeEditDialog();
    render();
  }
};

export const handleFormFieldClick = (e, deps) => {
  const { store, render } = deps;
  console.log("e.detail", e.detail);
  // Check if the clicked field is the color image
  if (e.detail.name === "colorImage") {
    const selectedItemId = store.selectSelectedItemId();
    if (selectedItemId) {
      store.openEditDialog(selectedItemId);
      render();
    }
  }
};

export const handleAddDialogClose = (e, deps) => {
  const { store, render } = deps;
  store.closeAddDialog();
  render();
};

export const handleAddFormAction = (e, deps) => {
  const { store, render, repository } = deps;

  if (e.detail.actionId === "submit") {
    const formData = e.detail.formValues;
    const targetGroupId = store.getState().targetGroupId;

    // Create the color in the repository
    repository.addAction({
      actionType: "treePush",
      target: "colors",
      value: {
        parent: targetGroupId,
        position: "last",
        item: {
          id: nanoid(),
          type: "color",
          name: formData.name,
          hex: formData.hex,
        },
      },
    });

    const { colors } = repository.getState();
    store.setItems(colors);
    store.closeAddDialog();
    render();
  }
};
