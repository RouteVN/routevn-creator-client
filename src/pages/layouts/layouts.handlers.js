import { nanoid } from "nanoid";

export const handleAfterMount = async (deps) => {
  const { store, projectService, render } = deps;
  await projectService.ensureRepository();
  const { layouts } = projectService.getState();
  store.setItems(layouts);
  render();
};

export const handleDataChanged = async (deps) => {
  const { store, render, projectService } = deps;
  const { layouts } = projectService.getState();
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
  const { store, render, getRefIds } = deps;
  const { itemId } = payload._event.detail; // Extract from forwarded event

  const { fileExplorer } = getRefIds();
  fileExplorer.elm.transformedHandlers.handlePageItemClick({
    _event: { detail: { itemId } },
  });

  store.setSelectedItemId(itemId);
  render();
};

export const handleItemDoubleClick = (deps, payload) => {
  const { appService } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) return;

  // Get current payload to preserve projectId
  const currentPayload = appService.getPayload();

  appService.navigate("/project/resources/layout-editor", {
    ...currentPayload, // Preserve existing payload (including p for projectId)
    layoutId: itemId,
  });
};

export const handleAddLayoutClick = (deps, payload) => {
  const { store, render } = deps;
  const { groupId } = payload._event.detail;

  store.openAddDialog(groupId);
  render();
};

export const handleDragDropFileSelected = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { files, targetGroupId } = payload._event.detail; // Extract from forwarded event
  const id = targetGroupId;

  // Upload all files
  const successfulUploads = await projectService.uploadFiles(files);

  for (const result of successfulUploads) {
    await projectService.appendEvent({
      type: "treePush",
      payload: {
        target: "layouts",
        value: {
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
        options: {
          parent: id,
          position: "last",
        },
      },
    });
  }

  if (successfulUploads.length > 0) {
    const { layouts } = projectService.getState();
    store.setItems(layouts);
  }

  render();
};

export const handleFormChange = async (deps, payload) => {
  const { projectService, render, store } = deps;
  await projectService.appendEvent({
    type: "treeUpdate",
    payload: {
      target: "layouts",
      value: {
        [payload._event.detail.name]: payload._event.detail.fieldValue,
      },
      options: {
        id: store.selectSelectedItemId(),
        replace: false,
      },
    },
  });

  const { layouts } = projectService.getState();
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

const createLayoutTemplate = (layoutType) => {
  if (layoutType === "dialogue") {
    const containerId = nanoid();
    const nameTextId = nanoid();
    const contentTextId = nanoid();

    return {
      items: {
        [containerId]: {
          type: "container",
          name: "Dialogue Container",
          x: 35,
          y: 695,
          gap: 0,
          width: 1850,
          height: 350,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        },
        [nameTextId]: {
          type: "text",
          name: "Character Name",
          x: 40,
          y: 30,
          width: 400,
          height: 40,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          text: "${dialogue.character.name}",
          style: {
            align: "left",
          },
        },
        [contentTextId]: {
          type: "text",
          name: "Dialogue Content",
          x: 40,
          y: 110,
          width: 1440,
          height: 140,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          text: "${dialogue.content[0].text}",
          displaySpeed: 100,
          style: {
            align: "left",
          },
        },
      },
      tree: [
        {
          id: containerId,
          children: [
            {
              id: nameTextId,
            },
            {
              id: contentTextId,
            },
          ],
        },
      ],
    };
  } else if (layoutType === "normal") {
    const rootId = nanoid();
    const textId = nanoid();

    return {
      items: {
        [rootId]: {
          type: "container",
          name: "Root",
          x: 0,
          y: 0,
          gap: 0,
          width: 1920,
          height: 1080,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        },
        [textId]: {
          type: "text",
          name: "Placeholder Text",
          x: 960,
          y: 540,
          width: 800,
          height: 100,
          anchorX: 0.5,
          anchorY: 0.5,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          text: "The most flexible layout, you can put anything here.",
          style: {
            align: "center",
            fontSize: 32,
          },
        },
      },
      tree: [
        {
          id: rootId,
          children: [
            {
              id: textId,
            },
          ],
        },
      ],
    };
  } else if (layoutType === "base") {
    const spriteId = nanoid();

    return {
      items: {
        [spriteId]: {
          type: "sprite",
          anchorX: 0,
          anchorY: 0,
          click: {
            actionPayload: {
              actions: {
                nextLine: {},
              },
            },
          },
          height: 1080,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          width: 1920,
          x: 0,
          y: 0,
        },
      },
      tree: [
        {
          id: spriteId,
        },
      ],
    };
  }

  return {
    items: {},
    tree: [],
  };
};

export const handleLayoutFormActionClick = async (deps, payload) => {
  const { store, render, projectService, appService } = deps;

  const formData = payload._event.detail.formValues;
  const targetGroupId = store.getState().targetGroupId;

  // Validate required fields
  if (!formData.name) {
    appService.showToast("Please enter a layout name", { title: "Warning" });
    return;
  }
  if (!formData.layoutType) {
    appService.showToast("Please select a layout type", { title: "Warning" });
    return;
  }

  // Create the layout directly in the repository (like colors page does)
  await projectService.appendEvent({
    type: "treePush",
    payload: {
      target: "layouts",
      value: {
        id: nanoid(),
        type: "layout",
        name: formData.name,
        layoutType: formData.layoutType,
        elements: createLayoutTemplate(formData.layoutType),
      },
      options: {
        parent: targetGroupId,
        position: "last",
      },
    },
  });

  const { layouts } = projectService.getState();
  store.setItems(layouts);
  store.closeAddDialog();
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, store, render } = deps;
  const { resourceType, itemId } = payload._event.detail;

  // Perform the delete operation
  await projectService.appendEvent({
    type: "treeDelete",
    payload: {
      target: resourceType,
      options: {
        id: itemId,
      },
    },
  });

  // Refresh data and update store (reuse existing logic from handleDataChanged)
  const data = projectService.getState()[resourceType];
  store.setItems(data);
  render();
};
