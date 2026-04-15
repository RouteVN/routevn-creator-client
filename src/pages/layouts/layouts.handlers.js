import { nanoid } from "nanoid";
import { createLayoutEditorPayload } from "../../internal/layoutEditorRoute.js";
import { recursivelyCheckResource } from "../../internal/project/projection.js";
import {
  requireProjectResolution,
  scaleLayoutElementsForProjectResolution,
} from "../../internal/projectResolution.js";
import { isFragmentLayout } from "../../internal/project/layout.js";
import { createCatalogPageHandlers } from "../../internal/ui/resourcePages/catalog/createCatalogPageHandlers.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";
import { createLayoutsFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";

const syncEditFormValues = ({ deps, values } = {}) => {
  const { editForm } = deps.refs;
  editForm.reset();
  editForm.setValues({ values });
};

const logSelectedLayoutItem = ({ store, itemId } = {}) => {
  if (!itemId) {
    return;
  }

  const item = store.selectLayoutItemById({ itemId });
  if (!item) {
    return;
  }

  console.log("Selected layout item", item);
};

const navigateToLayoutEditor = ({ appService, layoutId } = {}) => {
  const currentPayload = appService.getPayload();
  appService.navigate("/project/layout-editor", {
    ...createLayoutEditorPayload({
      payload: currentPayload,
      layoutId,
      resourceType: "layouts",
    }),
  });
};

const openLayoutEditorWithItem = ({ deps, itemId } = {}) => {
  if (!itemId) {
    return;
  }

  const { appService, refs, store } = deps;
  const layoutItem = store.selectLayoutItemById({ itemId });
  if (!layoutItem || layoutItem.type !== "layout") {
    return;
  }

  store.setSelectedItemId({ itemId });
  refs.fileExplorer.selectItem({ itemId });
  navigateToLayoutEditor({ appService, layoutId: itemId });
};

const openEditDialogWithValues = ({ deps, itemId } = {}) => {
  if (!itemId) {
    return;
  }

  const { store, render, refs } = deps;
  const layoutItem = store.selectLayoutItemById({ itemId });
  if (!layoutItem || layoutItem.type !== "layout") {
    return;
  }

  store.setSelectedItemId({ itemId });
  refs.fileExplorer.selectItem({ itemId });
  store.openEditDialog({
    itemId,
    defaultValues: {
      name: layoutItem.name ?? "",
      description: layoutItem.description ?? "",
      isFragment: isFragmentLayout(layoutItem),
    },
  });
  render();

  syncEditFormValues({
    deps,
    values: {
      name: layoutItem.name ?? "",
      description: layoutItem.description ?? "",
      isFragment: isFragmentLayout(layoutItem),
    },
  });
};

const {
  handleBeforeMount,
  refreshData: handleDataChanged,
  handleFileExplorerSelectionChanged: handleCatalogFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleItemClick: handleCatalogLayoutItemClick,
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
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleSearchInput,
};

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  handleCatalogFileExplorerSelectionChanged(deps, payload);

  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) {
    return;
  }

  logSelectedLayoutItem({ store: deps.store, itemId });
};

export const handleLayoutItemClick = (deps, payload) => {
  handleCatalogLayoutItemClick(deps, payload);

  const { itemId } = payload._event.detail;
  logSelectedLayoutItem({ store: deps.store, itemId });
};

export const handleFileExplorerDoubleClick = (deps, payload) => {
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) {
    return;
  }

  openLayoutEditorWithItem({ deps, itemId });
};

export const handleLayoutItemDoubleClick = (deps, payload) => {
  const { itemId } = payload._event.detail;
  openLayoutEditorWithItem({ deps, itemId });
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

export const handleEditDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeEditDialog();
  render();
};

export const handleDetailHeaderClick = (deps) => {
  const selectedItemId = deps.store.selectSelectedItemId();
  openEditDialogWithValues({ deps, itemId: selectedItemId });
};

const createLayoutElement = (id, data) => ({
  id,
  ...data,
});

export const createLayoutTemplate = (layoutType, projectResolution) => {
  if (layoutType === "dialogue") {
    const containerId = nanoid();
    const nameTextId = nanoid();
    const contentTextId = nanoid();

    return scaleLayoutElementsForProjectResolution(
      {
        items: {
          [containerId]: createLayoutElement(containerId, {
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
          }),
          [nameTextId]: createLayoutElement(nameTextId, {
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
            textStyle: {
              align: "left",
            },
          }),
          [contentTextId]: createLayoutElement(contentTextId, {
            type: "text-revealing-ref-dialogue-content",
            name: "Dialogue Content",
            x: 40,
            y: 110,
            width: 1440,
            anchorX: 0,
            anchorY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            text: "${dialogue.content[0].text}",
            textStyle: {
              align: "left",
            },
          }),
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
      },
      projectResolution,
    );
  }

  if (layoutType === "nvl") {
    const nvlContainerId = nanoid();
    const nvlBackgroundId = nanoid();
    const nvlLinesId = nanoid();
    const lineContainerId = nanoid();
    const lineNameTextId = nanoid();
    const lineContentTextId = nanoid();

    return scaleLayoutElementsForProjectResolution(
      {
        items: {
          [nvlContainerId]: createLayoutElement(nvlContainerId, {
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
          }),
          [nvlBackgroundId]: createLayoutElement(nvlBackgroundId, {
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
            imageId: "foPOJMdjT9agVRh68ST1o",
          }),
          [nvlLinesId]: createLayoutElement(nvlLinesId, {
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
          }),
          [lineContainerId]: createLayoutElement(lineContainerId, {
            type: "container-ref-dialogue-line",
            name: "Container (Dialogue Line)",
            x: 0,
            y: 0,
            width: 1640,
            height: 0,
            direction: "vertical",
            anchorX: 0,
            anchorY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
          }),
          [lineNameTextId]: createLayoutElement(lineNameTextId, {
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
            textStyle: {
              align: "left",
            },
            textStyleId: "qdM8QXbdBoqiPDUHZWheh",
          }),
          [lineContentTextId]: createLayoutElement(lineContentTextId, {
            type: "text-revealing",
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
            text: "${line.content[0].text}",
            textStyle: {
              wordWrapWidth: 300,
              align: "left",
            },
            textStyleId: "1TqapkiPUErN434i6YCFW",
            revealEffect: "none",
          }),
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
      },
      projectResolution,
    );
  }

  if (layoutType === "history") {
    const historyContainerId = nanoid();
    const titleTextId = nanoid();
    const closeButtonTextId = nanoid();
    const historyScrollContainerId = nanoid();
    const historyItemContainerId = nanoid();
    const historyCharacterNameId = nanoid();
    const historyContentId = nanoid();

    return scaleLayoutElementsForProjectResolution(
      {
        items: {
          [historyContainerId]: createLayoutElement(historyContainerId, {
            type: "container",
            name: "History Container",
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
          }),
          [titleTextId]: createLayoutElement(titleTextId, {
            type: "text",
            name: "History Title",
            x: 960,
            y: 120,
            width: 720,
            height: 64,
            anchorX: 0.5,
            anchorY: 0.5,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            text: "Dialogue History",
            textStyle: {
              align: "center",
            },
          }),
          [historyScrollContainerId]: createLayoutElement(
            historyScrollContainerId,
            {
              type: "container",
              name: "History Scroll Container",
              x: 490,
              y: 220,
              width: 940,
              height: 560,
              direction: "vertical",
              gap: 15,
              scroll: true,
              anchorX: 0,
              anchorY: 0,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
            },
          ),
          [historyItemContainerId]: createLayoutElement(
            historyItemContainerId,
            {
              type: "container-ref-history-line",
              name: "Container (History Item)",
              x: 0,
              y: 0,
              width: 920,
              gap: 5,
              direction: "vertical",
              anchorX: 0,
              anchorY: 0,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
            },
          ),
          [historyCharacterNameId]: createLayoutElement(
            historyCharacterNameId,
            {
              type: "text-ref-history-line-character-name",
              name: "Text (History Character Name)",
              $when: "item.characterName",
              x: 0,
              y: 0,
              width: 920,
              height: 40,
              anchorX: 0,
              anchorY: 0,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
              text: "text",
              textStyle: {
                align: "left",
              },
            },
          ),
          [historyContentId]: createLayoutElement(historyContentId, {
            type: "text-ref-history-line-content",
            name: "Text (History Line Content)",
            x: 0,
            y: 0,
            width: 920,
            height: 72,
            anchorX: 0,
            anchorY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            text: "text",
            textStyle: {
              align: "left",
            },
          }),
          [closeButtonTextId]: createLayoutElement(closeButtonTextId, {
            type: "text",
            name: "Close Button Text",
            x: 960,
            y: 855,
            width: 120,
            height: 40,
            anchorX: 0.5,
            anchorY: 0.5,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            text: "Close",
            textStyle: {
              align: "center",
            },
            click: {
              payload: {
                actions: {
                  popLayeredView: {},
                },
              },
            },
          }),
        },
        tree: [
          {
            id: historyContainerId,
            children: [
              {
                id: titleTextId,
              },
              {
                id: historyScrollContainerId,
                children: [
                  {
                    id: historyItemContainerId,
                    children: [
                      {
                        id: historyCharacterNameId,
                      },
                      {
                        id: historyContentId,
                      },
                    ],
                  },
                ],
              },
              {
                id: closeButtonTextId,
              },
            ],
          },
        ],
      },
      projectResolution,
    );
  }

  if (layoutType === "choice") {
    const choicesContainerId = nanoid();
    const choiceItemContainerId = nanoid();
    const choiceTextId = nanoid();
    const choiceBackgroundId = nanoid();

    return scaleLayoutElementsForProjectResolution(
      {
        items: {
          [choicesContainerId]: createLayoutElement(choicesContainerId, {
            type: "container",
            name: "Choices Container",
            x: 64,
            y: 300,
            width: 0,
            height: 0,
            anchorX: 0,
            anchorY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            direction: "vertical",
            gap: 36,
          }),
          [choiceItemContainerId]: createLayoutElement(choiceItemContainerId, {
            type: "container-ref-choice-item",
            name: "Container (Choice Item)",
            x: 0,
            y: 0,
            anchorX: 0,
            anchorY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            hover: {
              inheritToChildren: true,
            },
            click: {
              inheritToChildren: true,
            },
            rightClick: {
              inheritToChildren: true,
            },
          }),
          [choiceTextId]: createLayoutElement(choiceTextId, {
            type: "text-ref-choice-item-content",
            name: "Text (Choice Item Content)",
            x: 960,
            y: 10,
            anchorX: 0.5,
            anchorY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            text: "text",
            textStyle: {
              align: "center",
            },
            textStyleId: "WkzTF7gNhJSnG4MnZTh2U",
          }),
          [choiceBackgroundId]: createLayoutElement(choiceBackgroundId, {
            type: "sprite",
            name: "Choice Background",
            x: 0,
            y: 0,
            width: 1800,
            height: 80,
            anchorX: 0,
            anchorY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            imageId: "cdCXiw7A7zJxawo4iMwNS",
            hoverImageId: "KFdkZTWLURDHTkVV2dGEp",
          }),
        },
        tree: [
          {
            id: choicesContainerId,
            children: [
              {
                id: choiceItemContainerId,
                children: [
                  {
                    id: choiceBackgroundId,
                  },
                  {
                    id: choiceTextId,
                  },
                ],
              },
            ],
          },
        ],
      },
      projectResolution,
    );
  }

  if (layoutType === "confirmDialog") {
    const rootId = nanoid();
    const textId = nanoid();
    const confirmOkContainerId = nanoid();
    const confirmOkTextId = nanoid();
    const confirmCancelContainerId = nanoid();
    const confirmCancelTextId = nanoid();
    const spriteId = nanoid();

    return scaleLayoutElementsForProjectResolution(
      {
        items: {
          [rootId]: createLayoutElement(rootId, {
            type: "container",
            name: "Root",
            x: -1,
            y: 0,
            gap: 0,
            width: 1920,
            height: 1080,
            anchorX: 0,
            anchorY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
          }),
          [textId]: createLayoutElement(textId, {
            type: "text",
            name: "Text",
            x: 960,
            y: 400,
            width: 560,
            anchorX: 0.5,
            anchorY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            text: "Are you sure to go back to title page?",
            textStyle: {
              align: "center",
            },
            textStyleId: "AZb6o5taVeKePPowGTqqr",
          }),
          [confirmOkContainerId]: createLayoutElement(confirmOkContainerId, {
            type: "container-ref-confirm-dialog-ok",
            name: "Container (Confirm OK)",
            x: 800,
            y: 540,
            anchorX: 0.5,
            anchorY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            width: 0,
            height: 0,
          }),
          [confirmOkTextId]: createLayoutElement(confirmOkTextId, {
            type: "text",
            name: "Text",
            x: 0,
            y: 0,
            anchorX: 0,
            anchorY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            text: "Yes",
            textStyle: {
              align: "left",
            },
            textStyleId: "WkzTF7gNhJSnG4MnZTh2U",
            hoverTextStyleId: "6wXcAmc_SmJHzMIeKp--Z",
          }),
          [confirmCancelContainerId]: createLayoutElement(
            confirmCancelContainerId,
            {
              type: "container-ref-confirm-dialog-cancel",
              name: "Container (Confirm Cancel)",
              x: 1120,
              y: 540,
              anchorX: 0.5,
              anchorY: 0,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
              width: 0,
              height: 0,
            },
          ),
          [confirmCancelTextId]: createLayoutElement(confirmCancelTextId, {
            type: "text",
            name: "Text",
            x: 0,
            y: 0,
            anchorX: 0,
            anchorY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            text: "No",
            textStyle: {
              align: "left",
            },
            textStyleId: "WkzTF7gNhJSnG4MnZTh2U",
            hoverTextStyleId: "6wXcAmc_SmJHzMIeKp--Z",
          }),
          [spriteId]: createLayoutElement(spriteId, {
            type: "sprite",
            name: "Sprite",
            x: 960,
            y: 336,
            anchorX: 0.5,
            anchorY: 0,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            width: 840,
            height: 320,
            imageId: "QO_Ou5DAengpMP4_WnMBy",
          }),
        },
        tree: [
          {
            id: rootId,
            children: [
              {
                id: spriteId,
                children: [],
              },
              {
                id: textId,
                children: [],
              },
              {
                id: confirmOkContainerId,
                children: [
                  {
                    id: confirmOkTextId,
                    children: [],
                  },
                ],
              },
              {
                id: confirmCancelContainerId,
                children: [
                  {
                    id: confirmCancelTextId,
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
      projectResolution,
    );
  }

  if (layoutType === "normal" || layoutType === "save-load") {
    const rootId = nanoid();
    const textId = nanoid();

    return scaleLayoutElementsForProjectResolution(
      {
        items: {
          [rootId]: createLayoutElement(rootId, {
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
          }),
          [textId]: createLayoutElement(textId, {
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
            textStyle: {
              align: "center",
            },
          }),
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
      },
      projectResolution,
    );
  }

  return {
    items: {},
    tree: [],
  };
};

const protectedLayoutTypeLabels = {
  dialogue: "Dialogue",
  nvl: "NVL",
  choice: "Choice",
};

const canDeleteLayoutItem = (layouts, itemId) => {
  const items = Object.values(layouts?.items || {});
  const item = layouts?.items?.[itemId];
  const layoutType = item?.layoutType;

  if (!protectedLayoutTypeLabels[layoutType]) {
    return true;
  }

  const matchingCount = items.filter(
    (layout) => layout?.layoutType === layoutType,
  ).length;

  return matchingCount > 1;
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
  const isFragment = values?.isFragment ?? false;
  const description = values?.description ?? "";

  const projectResolution = requireProjectResolution(
    projectService.getRepositoryState().project?.resolution,
    "Project resolution",
  );

  const createAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to create layout.",
    action: () =>
      projectService.createLayoutItem({
        layoutId: nanoid(),
        name,
        layoutType,
        data: {
          description,
          isFragment,
        },
        elements: createLayoutTemplate(layoutType, projectResolution),
        parentId: store.getState().targetGroupId,
        position: "last",
      }),
  });

  if (!createAttempt.ok) {
    return;
  }

  store.closeAddDialog();
  await handleDataChanged(deps);
};

export const handleEditFormActionClick = async (deps, payload) => {
  const { store, projectService, appService, render } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showToast("Please enter a layout name", { title: "Warning" });
    return;
  }

  const editItemId = store.getState().editItemId;
  if (!editItemId) {
    store.closeEditDialog();
    render();
    return;
  }

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to update layout.",
    action: () =>
      projectService.updateLayoutItem({
        layoutId: editItemId,
        data: {
          name,
          description: values?.description ?? "",
          isFragment: values?.isFragment ?? false,
        },
      }),
  });
  if (!updateAttempt.ok) {
    return;
  }

  store.closeEditDialog();
  await handleDataChanged(deps);
};

export const handleOpenLayoutEditorClick = (deps, payload) => {
  const { appService } = deps;
  const layoutId = payload._event.currentTarget?.dataset?.layoutId;
  if (!layoutId) {
    return;
  }

  navigateToLayoutEditor({ appService, layoutId });
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, appService, render } = deps;
  const { itemId } = payload._event.detail;
  const state = projectService.getState();
  const layoutType = state.layouts?.items?.[itemId]?.layoutType;

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

  if (!canDeleteLayoutItem(state.layouts, itemId)) {
    appService.showToast(
      `Cannot delete the last ${protectedLayoutTypeLabels[layoutType]} layout. At least one ${protectedLayoutTypeLabels[layoutType]} layout must remain.`,
    );
    render();
    return;
  }

  await projectService.deleteLayoutItem({ layoutIds: [itemId] });
  await handleDataChanged(deps);
};

export const handleItemDuplicate = async (deps, payload) => {
  const { appService, projectService } = deps;
  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  const duplicateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to duplicate layout.",
    action: () =>
      projectService.duplicateLayoutItem({
        layoutId: itemId,
      }),
  });
  if (!duplicateAttempt.ok) {
    return;
  }

  await handleDataChanged(deps, {
    selectedItemId: duplicateAttempt.result,
  });
};
