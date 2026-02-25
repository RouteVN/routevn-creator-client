import { nanoid } from "nanoid";
import { recursivelyCheckResource } from "../../utils/resourceUsageChecker.js";

export const handleAfterMount = async (deps) => {
  const { store, projectService, render } = deps;
  await projectService.ensureRepository();
  const { layouts } = projectService.getState();
  store.setItems({ layoutsData: layouts });
  render();
};

export const handleDataChanged = async (deps) => {
  const { store, render, projectService } = deps;
  const { layouts } = projectService.getState();
  store.setItems({ layoutsData: layouts });
  render();
};

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  const { store, render } = deps;
  const { id } = payload._event.detail;

  store.setSelectedItemId({ itemId: id });
  render();
};

export const handleImageItemClick = (deps, payload) => {
  const { store, render, refs } = deps;
  const { itemId } = payload._event.detail; // Extract from forwarded event

  const { fileExplorer } = refs;
  fileExplorer.transformedHandlers.handlePageItemClick({
    _event: { detail: { itemId } },
  });

  store.setSelectedItemId({ itemId: itemId });
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

  store.openAddDialog({ groupId: groupId });
  render();
};

export const handleDragDropFileSelected = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { files, targetGroupId } = payload._event.detail; // Extract from forwarded event
  const id = targetGroupId;

  // Upload all files
  const successfulUploads = await projectService.uploadFiles(files);

  for (const result of successfulUploads) {
    await projectService.createLayoutItem({
      layoutId: nanoid(),
      name: result.displayName,
      layoutType: "normal",
      elements: {
        items: {},
        order: [],
      },
      parentId: id,
      position: "last",
      data: {
        fileId: result.fileId,
        fileType: result.file.type,
        fileSize: result.file.size,
      },
    });
  }

  if (successfulUploads.length > 0) {
    const { layouts } = projectService.getState();
    store.setItems({ layoutsData: layouts });
  }

  render();
};

export const handleFormChange = async (deps, payload) => {
  const { projectService, render, store } = deps;
  const fieldName = payload._event.detail.name;
  if (fieldName !== "name") {
    return;
  }
  await projectService.renameLayoutItem({
    layoutId: store.selectSelectedItemId(),
    name: payload._event.detail.value,
  });

  const { layouts } = projectService.getState();
  store.setItems({ layoutsData: layouts });
  render();
};
export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail?.value || "";
  store.setSearchQuery({ query: searchQuery });
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
      order: [
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
  } else if (layoutType === "nvl") {
    const nvlContainerId = nanoid();
    const nvlBackgroundId = nanoid();
    const nvlLinesId = nanoid();
    const lineContainerId = nanoid();
    const lineNameTextId = nanoid();
    const lineContentTextId = nanoid();

    return {
      items: {
        [nvlContainerId]: {
          type: "container",
          name: "NVL Container",
          x: 100,
          y: 80,
          width: 1720,
          height: 920,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        },
        [nvlBackgroundId]: {
          type: "sprite",
          name: "NVL Background",
          x: 0,
          y: 0,
          width: 1720,
          height: 920,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          imageId: "iN20__bg4TaS80gh7-XcL",
        },
        [nvlLinesId]: {
          type: "container",
          name: "NVL Lines",
          x: 40,
          y: 30,
          gap: 24,
          width: 1640,
          height: 860,
          direction: "vertical",
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        },
        [lineContainerId]: {
          type: "container-ref-dialogue-line",
          name: "Container (Dialogue Line)",
          x: 0,
          y: 0,
          width: 1640,
          height: 120,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        },
        [lineNameTextId]: {
          type: "text-ref-dialogue-line-character-name",
          name: "Text (Line Character Name)",
          $when: "line.characterName",
          x: 0,
          y: 0,
          width: 280,
          height: 40,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          text: "text",
          style: {
            align: "left",
          },
        },
        [lineContentTextId]: {
          type: "text-ref-dialogue-line-content",
          name: "Text (Line Content)",
          x: 0,
          y: 44,
          width: 1640,
          height: 72,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          text: "text",
          style: {
            align: "left",
          },
        },
      },
      order: [
        {
          id: nvlContainerId,
          children: [
            {
              id: nvlBackgroundId,
            },
            {
              id: nvlLinesId,
              children: [
                {
                  id: lineContainerId,
                  children: [
                    {
                      id: lineNameTextId,
                    },
                    {
                      id: lineContentTextId,
                    },
                  ],
                },
              ],
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
      order: [
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
      order: [
        {
          id: spriteId,
        },
      ],
    };
  }

  return {
    items: {},
    order: [],
  };
};

export const handleLayoutFormActionClick = async (deps, payload) => {
  const { store, render, projectService, appService } = deps;

  const formData = payload._event.detail.values;
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
  await projectService.createLayoutItem({
    layoutId: nanoid(),
    name: formData.name,
    layoutType: formData.layoutType,
    elements: createLayoutTemplate(formData.layoutType),
    parentId: targetGroupId,
    position: "last",
  });

  const { layouts } = projectService.getState();
  store.setItems({ layoutsData: layouts });
  store.closeAddDialog();
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, appService, store, render } = deps;
  const { resourceType, itemId } = payload._event.detail;

  const state = projectService.getState();
  const usage = recursivelyCheckResource({
    state,
    itemId,
    checkTargets: ["scenes"],
  });

  if (usage.isUsed) {
    appService.showToast("Cannot delete resource, it is currently in use.");
    render();
    return;
  }

  // Perform the delete operation
  await projectService.deleteLayoutItem({ layoutId: itemId });

  // Refresh data and update store (reuse existing logic from handleDataChanged)
  const data = projectService.getState()[resourceType];
  store.setItems({ layoutsData: data });
  render();
};
