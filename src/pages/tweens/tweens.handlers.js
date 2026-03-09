import { nanoid } from "nanoid";
import { recursivelyCheckResource } from "../../utils/resourceUsageChecker.js";
import { createCatalogPageHandlers } from "../../deps/features/resourcePages/catalog/createCatalogPageHandlers.js";
import { resetState } from "./tweens.constants";

const defaultInitialValues = {
  x: 960,
  y: 540,
  alpha: 1,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
};

const openTweenDialog = async ({
  deps,
  editMode = false,
  itemId,
  itemData,
  targetGroupId,
} = {}) => {
  const { graphicsService, refs, render, store } = deps;

  store.openDialog({
    editMode,
    itemId,
    itemData,
    targetGroupId,
  });
  render();

  if (editMode && itemData) {
    refs.animationForm.reset();
    refs.animationForm.setValues({
      values: {
        name: itemData.name ?? "",
      },
    });
  }

  const { canvas } = refs;
  if (!canvas || !graphicsService) {
    return;
  }

  await graphicsService.init({ canvas });
  graphicsService.render(resetState);
};

const {
  handleBeforeMount,
  handleAfterMount,
  refreshData: handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleItemClick: handleAnimationItemClick,
  handleSearchInput,
} = createCatalogPageHandlers({
  resourceType: "tweens",
});

export {
  handleBeforeMount,
  handleAfterMount,
  handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleAnimationItemClick,
  handleSearchInput,
};

export const handleAddAnimationClick = async (deps, payload) => {
  const { groupId } = payload._event.detail;

  await openTweenDialog({
    deps,
    targetGroupId: groupId,
  });
};

export const handleAnimationItemDoubleClick = async (deps, payload) => {
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder || !itemId) {
    return;
  }

  const itemData = deps.store.selectTweenDisplayItemById({ itemId });
  if (!itemData) {
    return;
  }

  await openTweenDialog({
    deps,
    editMode: true,
    itemId,
    itemData,
  });
};

export const handleCloseDialog = (deps) => {
  const { render, store } = deps;
  store.closeDialog();
  render();
};

export const handleClosePopover = (deps) => {
  const { render, store } = deps;
  store.closePopover();
  render();
};

export const handleFormActionClick = async (deps, payload) => {
  const { appService, projectService, store } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showToast("Tween name is required.", { title: "Warning" });
    return;
  }

  const properties = structuredClone(store.selectProperties());
  const editMode = store.selectEditMode();
  const editItemId = store.selectEditItemId();

  if (editMode && editItemId) {
    await projectService.updateResourceItem({
      resourceType: "tweens",
      resourceId: editItemId,
      patch: {
        name,
        properties,
      },
    });
  } else {
    await projectService.createResourceItem({
      resourceType: "tweens",
      resourceId: nanoid(),
      data: {
        type: "tween",
        name,
        duration: "4s",
        keyframes: 3,
        properties,
      },
      parentId: store.selectTargetGroupId(),
      position: "last",
    });
  }

  store.closeDialog();
  await handleDataChanged(deps);
};

export const handleAddPropertiesClick = (deps, payload) => {
  const { render, store } = deps;

  store.setPopover({
    mode: "addProperty",
    x: payload._event.clientX,
    y: payload._event.clientY,
  });
  render();
};

export const handleAddPropertyFormSubmit = (deps, payload) => {
  const { render, store } = deps;
  const { property, initialValue, useInitialValue } =
    payload._event.detail.values;

  const finalInitialValue = useInitialValue
    ? initialValue !== undefined
      ? initialValue
      : (defaultInitialValues[property] ?? 0)
    : (defaultInitialValues[property] ?? 0);

  store.addProperty({ property, initialValue: finalInitialValue });
  store.closePopover();
  render();
};

export const handleAddKeyframeInDialog = (deps, payload) => {
  const { render, store } = deps;

  store.setPopover({
    mode: "addKeyframe",
    x: payload._event.detail.x,
    y: payload._event.detail.y,
    payload: {
      property: payload._event.detail.property,
    },
  });
  render();
};

export const handleAddKeyframeFormSubmit = (deps, payload) => {
  const { render, store } = deps;
  const {
    payload: { property, index },
  } = store.selectPopover();

  const formValues = payload._event.detail.values;
  if (formValues.duration < 1) {
    formValues.duration = 1;
  }

  store.addKeyframe({
    ...formValues,
    property,
    index,
  });
  store.closePopover();
  render();
};

export const handleKeyframeRightClick = (deps, payload) => {
  const { render, store } = deps;
  store.setPopover({
    mode: "keyframeMenu",
    x: payload._event.detail.x,
    y: payload._event.detail.y,
    payload: {
      property: payload._event.detail.property,
      index: payload._event.detail.index,
    },
  });
  render();
};

export const handlePropertyNameRightClick = (deps, payload) => {
  const { render, store } = deps;
  store.setPopover({
    mode: "propertyNameMenu",
    x: payload._event.detail.x,
    y: payload._event.detail.y,
    payload: {
      property: payload._event.detail.property,
    },
  });
  render();
};

export const handleKeyframeDropdownItemClick = (deps, payload) => {
  const { render, store } = deps;
  const popover = store.selectPopover();
  const { property, index } = popover.payload;
  const { x, y } = popover;
  const value = payload._event.detail.item.value;

  if (value === "edit") {
    store.setPopover({
      mode: "editKeyframe",
      x,
      y,
      payload: {
        property,
        index,
      },
    });
  } else if (value === "delete-property") {
    store.deleteProperty({ property });
    store.closePopover();
  } else if (value === "delete-keyframe") {
    store.deleteKeyframe({ property, index });
    store.closePopover();
  } else if (value === "add-right") {
    store.setPopover({
      mode: "addKeyframe",
      x,
      y,
      payload: {
        property,
        index: index + 1,
      },
    });
  } else if (value === "add-left") {
    store.setPopover({
      mode: "addKeyframe",
      x,
      y,
      payload: {
        property,
        index,
      },
    });
  } else if (value === "move-right") {
    store.moveKeyframeRight({ property, index });
    store.closePopover();
  } else if (value === "move-left") {
    store.moveKeyframeLeft({ property, index });
    store.closePopover();
  }

  render();
};

export const handleEditKeyframeFormSubmit = (deps, payload) => {
  const { render, store } = deps;
  const {
    payload: { property, index },
  } = store.selectPopover();

  const formValues = payload._event.detail.values;
  if (formValues.duration < 1) {
    formValues.duration = 1;
  }

  store.updateKeyframe({
    keyframe: formValues,
    index,
    property,
  });
  store.closePopover();
  render();
};

export const handleInitialValueClick = (deps, payload) => {
  const { render, store } = deps;
  store.setPopover({
    mode: "editInitialValue",
    x: payload._event.detail.x,
    y: payload._event.detail.y,
    payload: {
      property: payload._event.detail.property,
    },
  });
  render();
};

const updatePopoverFieldValue = ({ store, detail } = {}) => {
  const { name, value } = detail;
  const currentFormValues = store.selectPopover().formValues ?? {};
  store.updatePopoverFormValues({
    formValues: {
      ...currentFormValues,
      [name]: value,
    },
  });
};

export const handleAddPropertyFormChange = (deps, payload) => {
  const { render, store } = deps;
  updatePopoverFieldValue({
    store,
    detail: payload._event.detail,
  });
  render();
};

export const handleEditInitialValueFormChange = (deps, payload) => {
  const { render, store } = deps;
  updatePopoverFieldValue({
    store,
    detail: payload._event.detail,
  });
  render();
};

export const handleReplayAnimation = async (deps) => {
  const { graphicsService, store } = deps;
  if (!graphicsService) {
    return;
  }

  await graphicsService.render(resetState);

  setTimeout(() => {
    graphicsService.render(store.selectAnimationRenderStateWithAnimations());
  }, 100);
};

export const handleEditInitialValueFormSubmit = (deps, payload) => {
  const { render, store } = deps;
  const {
    payload: { property },
  } = store.selectPopover();

  const { initialValue, valueSource } = payload._event.detail.values;
  const finalInitialValue =
    valueSource === "default" || initialValue === undefined
      ? (defaultInitialValues[property] ?? 0)
      : initialValue;

  store.updateInitialValue({
    property,
    initialValue: finalInitialValue,
  });
  store.closePopover();
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { appService, projectService } = deps;
  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  const usage = recursivelyCheckResource({
    state: projectService.getState(),
    itemId,
    checkTargets: ["scenes", "layouts"],
  });

  if (usage.isUsed) {
    appService.showToast("Cannot delete resource, it is currently in use.");
    return;
  }

  await projectService.deleteResourceItem({
    resourceType: "tweens",
    resourceId: itemId,
  });

  await handleDataChanged(deps);
};
