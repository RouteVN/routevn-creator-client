import { nanoid } from "nanoid";

export const handleAfterMount = async (deps) => {
  const { store, repositoryFactory, router, render } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { layouts } = repository.getState();
  console.log("Layouts loaded:", layouts);
  store.setItems(layouts);
  render();
};

export const handleDataChanged = async (deps) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { layouts } = repository.getState();
  store.setItems(layouts);
  render();
};

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  const { store, render } = deps;
  const { id } = payload._event.detail;

  store.setSelectedItemId(id);
  render();
};

export const handleImageItemClick = (deps, payload) => {
  const { store, render } = deps;
  const { itemId } = payload._event.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);
  render();
};

export const handleItemDoubleClick = (deps, payload) => {
  const { router, subject } = deps;
  const { itemId } = payload._event.detail;

  // Get current payload to preserve projectId
  const currentPayload = router ? router.getPayload() : {};

  subject.dispatch("redirect", {
    path: "/project/resources/layout-editor",
    payload: {
      ...currentPayload, // Preserve existing payload (including p for projectId)
      layoutId: itemId,
    },
  });
};

export const handleAddLayoutClick = (deps, payload) => {
  const { store, render } = deps;
  const { groupId } = payload._event.detail;

  store.openAddDialog(groupId);
  render();
};

export const handleDragDropFileSelected = async (deps, payload) => {
  const { store, render, fileManagerFactory, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { files, targetGroupId } = payload._event.detail; // Extract from forwarded event
  const id = targetGroupId;

  // Get fileManager for this project
  const fileManager = await fileManagerFactory.getByProject(p);

  // Upload all files
  const uploadResults = await fileManager.upload(files);

  // uploadResults already contains only successful uploads
  const successfulUploads = uploadResults;

  successfulUploads.forEach((result) => {
    repository.addAction({
      actionType: "treePush",
      target: "layouts",
      value: {
        parent: id,
        position: "last",
        item: {
          id: nanoid(),
          type: "layout",
          fileId: result.fileId,
          name: result.displayName,
          fileType: result.file.type,
          fileSize: result.file.size,
          elements: {
            items: {},
            tree: [],
          },
        },
      },
    });
  });

  if (successfulUploads.length > 0) {
    const { layouts } = repository.getState();
    store.setItems(layouts);
  }

  console.log(
    `Uploaded ${successfulUploads.length} out of ${files.length} files successfully`,
  );
  render();
};

export const handleFormChange = async (deps, payload) => {
  const { repositoryFactory, router, render, store } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  repository.addAction({
    actionType: "treeUpdate",
    target: "layouts",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: {
        [payload._event.detail.name]: payload._event.detail.fieldValue,
      },
    },
  });

  const { layouts } = repository.getState();
  store.setItems(layouts);
  render();
};
export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail?.value || "";
  store.setSearchQuery(searchQuery);
  render();
};

export const handleAddDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeAddDialog();
  render();
};

export const handleLayoutFormActionClick = async (deps, payload) => {
  const { store, render, repositoryFactory, router, globalUI } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);

  const formData = payload._event.detail.formValues;
  const targetGroupId = store.getState().targetGroupId;

  // Validate required fields
  if (!formData.name) {
    globalUI.showAlert({
      message: "Please enter a layout name",
      title: "Warning",
    });
    return;
  }
  if (!formData.layoutType) {
    globalUI.showAlert({
      message: "Please select a layout type",
      title: "Warning",
    });
    return;
  }

  // Create the layout directly in the repository (like colors page does)
  repository.addAction({
    actionType: "treePush",
    target: "layouts",
    value: {
      parent: targetGroupId,
      position: "last",
      item: {
        id: nanoid(),
        type: "layout",
        name: formData.name,
        layoutType: formData.layoutType,
        elements: {
          items: {},
          tree: [],
        },
      },
    },
  });

  const { layouts } = repository.getState();
  store.setItems(layouts);
  store.closeAddDialog();
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
