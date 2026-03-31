import { nanoid } from "nanoid";
import { createLayoutEditorPayload } from "../../internal/layoutEditorRoute.js";
import { recursivelyCheckResource } from "../../internal/project/projection.js";
import {
  requireProjectResolution,
  scaleLayoutElementsForProjectResolution,
} from "../../internal/projectResolution.js";
import {
  isFragmentLayout,
  normalizeLayoutType,
} from "../../internal/project/layout.js";
import { createCatalogPageHandlers } from "../../internal/ui/resourcePages/catalog/createCatalogPageHandlers.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";
import { createLayoutsFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";

const syncEditFormValues = ({ deps, values } = {}) => {
  const { editForm } = deps.refs;
  editForm.reset();
  editForm.setValues({ values });
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
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) {
    return;
  }

  openEditDialogWithValues({ deps, itemId });
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

const createLayoutElement = (id, data) => ({
  id,
  ...data,
});

const createLayoutTemplate = (layoutType, projectResolution) => {
  const normalizedLayoutType = normalizeLayoutType(layoutType);

  if (normalizedLayoutType === "dialogue") {
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
            height: 140,
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

  if (normalizedLayoutType === "nvl") {
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
            height: 120,
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
          }),
          [lineContentTextId]: createLayoutElement(lineContentTextId, {
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
            textStyle: {
              align: "left",
            },
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

  if (
    normalizedLayoutType === "normal" ||
    normalizedLayoutType === "save" ||
    normalizedLayoutType === "load" ||
    normalizedLayoutType === "confirmDialog"
  ) {
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
  const layoutType = normalizeLayoutType(item?.layoutType);

  if (!protectedLayoutTypeLabels[layoutType]) {
    return true;
  }

  const matchingCount = items.filter(
    (layout) => normalizeLayoutType(layout?.layoutType) === layoutType,
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
        isFragment,
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
  const layoutType = normalizeLayoutType(
    state.layouts?.items?.[itemId]?.layoutType,
  );

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
