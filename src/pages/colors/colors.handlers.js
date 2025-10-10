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

export const handleAfterMount = async (deps) => {
  const { store, repositoryFactory, router, render } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { colors } = repository.getState();
  store.setItems(colors);
  render();
};

export const handleDataChanged = async (deps) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { colors } = repository.getState();
  store.setItems(colors);
  render();
};

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  const { store, render } = deps;
  const { id } = payload._event.detail;

  store.setSelectedItemId(id);
  render();
};

export const handleColorItemClick = (deps, payload) => {
  const { store, render } = deps;
  const { itemId } = payload._event.detail; // Extract from forwarded event
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

export const handleColorCreated = async (deps, payload) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { groupId, name, hex } = payload._event.detail;

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

export const handleColorEdited = (deps, payload) => {
  const { subject } = deps;
  const { itemId, name, hex } = payload._event.detail;

  // Dispatch to app handlers for repository update
  subject.dispatch("update-color", {
    itemId,
    updates: {
      name,
      hex,
    },
  });
};

export const handleFormChange = async (deps, payload) => {
  const { repositoryFactory, router, render, store } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  repository.addAction({
    actionType: "treeUpdate",
    target: "colors",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: {
        [payload._event.detail.name]: payload._event.detail.fieldValue,
      },
    },
  });

  const { colors } = repository.getState();
  store.setItems(colors);

  // Update context if hex value changed
  if (payload._event.detail.name === "hex") {
    store.setContext({
      colorImage: {
        src: hexToBase64Image(payload._event.detail.fieldValue),
      },
    });
  }

  render();
};

export const handleColorItemDoubleClick = (deps, payload) => {
  const { store, render } = deps;
  const { itemId } = payload._event.detail;
  store.openEditDialog(itemId);
  render();
};

export const handleAddColorClick = (deps, payload) => {
  const { store, render } = deps;
  const { groupId } = payload._event.detail;
  store.openAddDialog(groupId);
  render();
};

export const handleEditDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeEditDialog();
  render();
};

export const handleEditFormAction = async (deps, payload) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);

  if (payload._event.detail.actionId === "submit") {
    const formData = payload._event.detail.formValues;
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

export const handleFormFieldClick = (deps, payload) => {
  const { store, render } = deps;
  console.log("payload._event.detail", payload._event.detail);
  // Check if the clicked field is the color image
  if (payload._event.detail.name === "colorImage") {
    const selectedItemId = store.selectSelectedItemId();
    if (selectedItemId) {
      store.openEditDialog(selectedItemId);
      render();
    }
  }
};

export const handleAddDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeAddDialog();
  render();
};

export const handleAddFormAction = async (deps, payload) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);

  if (payload._event.detail.actionId === "submit") {
    const formData = payload._event.detail.formValues;
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

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail?.value || "";
  store.setSearchQuery(searchQuery);
  render();
};

export const handleGroupToggle = (deps, payload) => {
  const { store, render } = deps;
  const { groupId } = payload._event.detail;
  store.toggleGroupCollapse(groupId);
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { repositoryFactory, router, store, render } = deps;
  const { p: projectId } = router.getPayload();
  const repository = await repositoryFactory.getByProject(projectId);
  const { resourceType, itemId } = payload._event.detail;

  // Perform the delete operation
  repository.addAction({
    actionType: "treeDelete",
    target: resourceType,
    value: {
      id: itemId,
    },
  });

  // Refresh data and update store (reuse existing logic from handleDataChanged)
  const data = repository.getState()[resourceType];
  store.setItems(data);
  render();
};
