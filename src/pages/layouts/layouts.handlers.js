import { nanoid } from "nanoid";
import { createLayoutEditorPayload } from "../../internal/layoutEditorRoute.js";
import { recursivelyCheckResource } from "../../internal/project/projection.js";
import { createCatalogPageHandlers } from "../../internal/ui/resourcePages/catalog/createCatalogPageHandlers.js";
import { createLayoutsFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";

const {
  handleBeforeMount,
  refreshData: handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleItemClick: handleLayoutItemClick,
  handleSearchInput,
} = createCatalogPageHandlers({
  resourceType: "layouts",
  createExplorerHandlers: ({ refresh }) =>
    createLayoutsFileExplorerHandlers({
      refresh,
    }),
});

export {
  handleBeforeMount,
  handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleLayoutItemClick,
  handleSearchInput,
};

export const handleItemDoubleClick = (deps, payload) => {
  const { appService } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) {
    return;
  }

  const currentPayload = appService.getPayload();
  appService.navigate("/project/layout-editor", {
    ...createLayoutEditorPayload({
      payload: currentPayload,
      layoutId: itemId,
      resourceType: "layouts",
    }),
  });
};

export const handleAddLayoutClick = (deps, payload) => {
  const { store, render } = deps;
  const { groupId } = payload._event.detail;
  store.openAddDialog({ groupId });
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
  }

  if (layoutType === "nvl") {
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
          anchorToBottom: true,
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
      tree: [
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
  }

  if (layoutType === "normal") {
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
  }

  return {
    items: {},
    tree: [],
  };
};

export const handleLayoutFormActionClick = async (deps, payload) => {
  const { store, projectService, appService } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showToast("Please enter a layout name", { title: "Warning" });
    return;
  }

  const layoutType = values?.layoutType;
  if (!layoutType) {
    appService.showToast("Please select a layout type", { title: "Warning" });
    return;
  }

  await projectService.createLayoutItem({
    layoutId: nanoid(),
    name,
    layoutType,
    elements: createLayoutTemplate(layoutType),
    parentId: store.getState().targetGroupId,
    position: "last",
  });

  store.closeAddDialog();
  await handleDataChanged(deps);
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, appService, render } = deps;
  const { itemId } = payload._event.detail;

  const usage = recursivelyCheckResource({
    state: projectService.getState(),
    itemId,
    checkTargets: ["scenes"],
  });

  if (usage.isUsed) {
    appService.showToast("Cannot delete resource, it is currently in use.");
    render();
    return;
  }

  await projectService.deleteLayoutItem({ layoutIds: [itemId] });
  await handleDataChanged(deps);
};
