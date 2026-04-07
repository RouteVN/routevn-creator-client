import { nanoid } from "nanoid";
import { createLayoutEditorPayload } from "../../internal/layoutEditorRoute.js";
import { recursivelyCheckResource } from "../../internal/project/projection.js";
import { createCatalogPageHandlers } from "../../internal/ui/resourcePages/catalog/createCatalogPageHandlers.js";
import { createControlsFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";
import {
  getInteractionActions,
  withInteractionPayload,
} from "../../internal/project/interactionPayload.js";
import { BASE_LAYOUT_KEYBOARD_OPTIONS } from "../../internal/project/layout.js";
import {
  requireProjectResolution,
  scaleLayoutElementsForProjectResolution,
} from "../../internal/projectResolution.js";

const {
  handleBeforeMount,
  refreshData: handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleItemClick: handleControlItemClick,
  handleSearchInput,
} = createCatalogPageHandlers({
  resourceType: "controls",
  createExplorerHandlers: ({ refresh }) =>
    createControlsFileExplorerHandlers({
      refresh,
    }),
});

export {
  handleBeforeMount,
  handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleControlItemClick,
  handleSearchInput,
};

const getSelectedControl = (store) => {
  const selectedItem = store.selectSelectedItem();
  if (selectedItem?.type !== "control") {
    return undefined;
  }

  return selectedItem;
};

const getKeyboardEntryActions = (layout, key) => {
  return getInteractionActions(layout?.keyboard?.[key]);
};

const getKeyboardEditorMode = (actions = {}) => {
  const actionIds = Object.keys(actions);
  if (actionIds.length !== 1) {
    return "actions";
  }

  return actionIds[0];
};

const updateControlKeyboard = async ({
  appService,
  projectService,
  store,
  key,
  interaction,
}) => {
  const control = getSelectedControl(store);
  if (!control?.id || !key) {
    return false;
  }

  const currentKeyboard =
    control.keyboard && typeof control.keyboard === "object"
      ? control.keyboard
      : {};
  const nextKeyboard = {};

  Object.entries(currentKeyboard).forEach(([entryKey, entryValue]) => {
    if (entryKey !== key) {
      nextKeyboard[entryKey] = structuredClone(entryValue);
    }
  });

  if (interaction !== undefined) {
    nextKeyboard[key] = interaction;
  }

  const data = {};
  data.keyboard =
    Object.keys(nextKeyboard).length > 0 ? nextKeyboard : undefined;

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to update keyboard action.",
    action: () =>
      projectService.updateControlItem({
        controlId: control.id,
        data,
      }),
  });

  if (!updateAttempt.ok) {
    return false;
  }

  return true;
};

const openEditDialogWithValues = ({ deps, itemId } = {}) => {
  if (!itemId) {
    return;
  }

  const { store, refs, render } = deps;
  const { fileExplorer, controlForm } = refs;
  const controlItem = store.selectControlItemById({ itemId });
  if (!controlItem || controlItem.type !== "control") {
    return;
  }

  const editValues = {
    name: controlItem.name ?? "",
    description: controlItem.description ?? "",
  };

  store.setSelectedItemId({ itemId });
  fileExplorer?.selectItem?.({ itemId });
  store.openEditDialog({
    itemId,
    defaultValues: editValues,
  });
  render();
  controlForm.reset();
  controlForm.setValues({ values: editValues });
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
      resourceType: "controls",
    }),
  });
};

export const handleAddControlClick = (deps, payload) => {
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

export const handleDetailHeaderClick = (deps) => {
  const selectedItemId = deps.store.selectSelectedItemId();
  openEditDialogWithValues({ deps, itemId: selectedItemId });
};

const createControlTemplate = (projectResolution) => {
  const spriteId = nanoid();

  return scaleLayoutElementsForProjectResolution(
    {
      items: {
        [spriteId]: {
          type: "sprite",
          anchorX: 0,
          anchorY: 0,
          click: {
            payload: {
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
    },
    projectResolution,
  );
};

export const handleControlFormActionClick = async (deps, payload) => {
  const { store, projectService, appService } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showToast("Please enter a control name", { title: "Warning" });
    return;
  }

  const description = values?.description ?? "";
  const editItemId = store.getState().editItemId;

  if (editItemId) {
    const updateAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage: "Failed to update control.",
      action: () =>
        projectService.updateControlItem({
          controlId: editItemId,
          data: {
            name,
            description,
          },
        }),
    });

    if (!updateAttempt.ok) {
      return;
    }
  } else {
    const projectResolution = requireProjectResolution(
      projectService.getRepositoryState().project?.resolution,
      "Project resolution",
    );

    const createAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage: "Failed to create control.",
      action: () =>
        projectService.createControlItem({
          controlId: nanoid(),
          name,
          data: {
            description,
          },
          elements: createControlTemplate(projectResolution),
          parentId: store.getState().targetGroupId,
          position: "last",
        }),
    });

    if (!createAttempt.ok) {
      return;
    }
  }

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

  await projectService.deleteControlItem({ controlIds: [itemId] });
  await handleDataChanged(deps);
};

export const handleKeyboardAddClick = async (deps, payload) => {
  const { appService, refs, render, store } = deps;
  const control = getSelectedControl(store);
  if (!control) {
    return;
  }

  const assignedKeys = new Set(Object.keys(control.keyboard || {}));
  const availableItems = BASE_LAYOUT_KEYBOARD_OPTIONS.filter(
    (item) => !assignedKeys.has(item.value),
  ).map((item) => ({
    type: "item",
    key: item.value,
    label: item.label,
  }));

  if (availableItems.length === 0) {
    appService.showToast("All available keyboard keys are already assigned", {
      title: "Warning",
    });
    return;
  }

  const result = await appService.showDropdownMenu({
    items: availableItems,
    x: payload._event.clientX,
    y: payload._event.clientY,
    place: "bs",
  });
  if (!result?.item?.key) {
    return;
  }

  store.openKeyboardEditor({
    key: result.item.key,
    actions: {},
  });
  render();

  refs.keyboardSystemActions.transformedHandlers.open({
    mode: "actions",
  });
};

export const handleKeyboardItemClick = (deps, payload) => {
  const { refs, render, store } = deps;
  const control = getSelectedControl(store);
  if (!control) {
    return;
  }

  const key = payload._event.currentTarget.dataset.key;
  if (!key) {
    return;
  }

  const actions = getKeyboardEntryActions(control, key);
  store.openKeyboardEditor({
    key,
    actions,
  });
  render();

  refs.keyboardSystemActions.transformedHandlers.open({
    mode: getKeyboardEditorMode(actions),
  });
};

export const handleKeyboardItemRightClick = async (deps, payload) => {
  const { appService } = deps;
  const event = payload._event;
  event.preventDefault();

  const key = event.currentTarget.dataset.key;
  if (!key) {
    return;
  }

  const result = await appService.showDropdownMenu({
    items: [{ type: "item", key: "remove", label: "Delete" }],
    x: event.clientX,
    y: event.clientY,
    place: "bs",
  });
  if (result?.item?.key !== "remove") {
    return;
  }

  const updated = await updateControlKeyboard({
    appService,
    projectService: deps.projectService,
    store: deps.store,
    key,
    interaction: undefined,
  });
  if (!updated) {
    return;
  }

  await handleDataChanged(deps);
};

export const handleKeyboardActionsChange = async (deps, payload) => {
  const { appService, render, store } = deps;
  const key = store.selectKeyboardEditorKey();
  if (!key) {
    return;
  }

  const actions = payload._event.detail || {};
  const interaction = withInteractionPayload({}, { actions });
  const updated = await updateControlKeyboard({
    appService,
    projectService: deps.projectService,
    store,
    key,
    interaction,
  });

  store.closeKeyboardEditor();
  render();

  if (!updated) {
    return;
  }

  await handleDataChanged(deps);
};

export const handleKeyboardActionsClose = (deps) => {
  const { render, store } = deps;
  store.closeKeyboardEditor();
  render();
};
