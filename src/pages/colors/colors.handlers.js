import { nanoid } from "nanoid";

const hexToBase64Image = (hex) => {
  if (!hex) return "";

  // Create a canvas element
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  // Set canvas size
  canvas.width = 100;
  canvas.height = 100;

  // Fill with the color
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 100, 100);

  // Convert to base64
  return canvas.toDataURL("image/png");
};

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

  const selectedItem = store.selectSelectedItem();
  if (selectedItem && selectedItem.hex) {
    store.setContext({
      colorImage: {
        src: hexToBase64Image(selectedItem.hex),
      },
    });
  }
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

  // Update context if hex value changed
  if (e.detail.name === "hex") {
    store.setContext({
      colorImage: {
        src: hexToBase64Image(e.detail.fieldValue),
      },
    });
  }

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
    const editItemId = store.getState().editItemId;

    // Update the color in the repository
    repository.addAction({
      actionType: "treeUpdate",
      target: "colors",
      value: {
        id: editItemId,
        replace: false,
        item: {
          name: formData.name,
          hex: formData.hex,
        },
      },
    });

    const { colors } = repository.getState();
    store.setItems(colors);

    // Update context if this is the selected item
    if (editItemId === store.getState().selectedItemId) {
      store.setContext({
        colorImage: {
          src: hexToBase64Image(formData.hex),
        },
      });
    }

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
    const newColorId = nanoid();

    // Create the color in the repository
    repository.addAction({
      actionType: "treePush",
      target: "colors",
      value: {
        parent: targetGroupId,
        position: "last",
        item: {
          id: newColorId,
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
