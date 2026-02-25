import { nanoid } from "nanoid";
import { resetState } from "./tweens.constants";
import { recursivelyCheckResource } from "../../utils/resourceUsageChecker.js";

const resolveDetailItemId = (detail = {}) => {
  return detail.itemId || detail.id || detail.item?.id || "";
};

const callFormMethod = ({ formRef, methodName, payload } = {}) => {
  if (!formRef || !methodName) return false;

  if (typeof formRef[methodName] === "function") {
    formRef[methodName](payload);
    return true;
  }

  if (typeof formRef.transformedMethods?.[methodName] === "function") {
    formRef.transformedMethods[methodName](payload);
    return true;
  }

  return false;
};

const createDetailFormValues = (item) => {
  if (!item) {
    return {
      name: "",
      duration: "",
    };
  }

  return {
    name: item.name || "",
    duration: item.duration ?? "",
  };
};

const syncDetailFormValues = ({
  deps,
  values,
  selectedItemId,
  attempt = 0,
} = {}) => {
  const formRef = deps?.refs?.detailForm;
  const currentSelectedItemId = deps?.store?.selectSelectedItemId?.();

  if (!selectedItemId || selectedItemId !== currentSelectedItemId) {
    return;
  }

  if (!formRef) {
    if (attempt < 6) {
      setTimeout(() => {
        syncDetailFormValues({
          deps,
          values,
          selectedItemId,
          attempt: attempt + 1,
        });
      }, 0);
    }
    return;
  }

  callFormMethod({ formRef, methodName: "reset" });

  const didSet = callFormMethod({
    formRef,
    methodName: "setValues",
    payload: { values },
  });

  if (!didSet && attempt < 6) {
    setTimeout(() => {
      syncDetailFormValues({
        deps,
        values,
        selectedItemId,
        attempt: attempt + 1,
      });
    }, 0);
  }
};

export const handleAfterMount = async (deps) => {
  const { store, projectService, render, graphicsService, refs } = deps;
  await projectService.ensureRepository();
  const { tweens } = projectService.getState();
  store.setItems({ tweensData: tweens || { order: [], items: {} } });

  // Initialize graphicsService if canvas is present
  const { canvas } = refs;
  if (
    graphicsService &&
    canvas &&
    canvas &&
    !store.selectIsGraphicsServiceInitialized()
  ) {
    await graphicsService.init({
      canvas: canvas,
    });
    store.setGraphicsServiceInitialized({ initialized: true });
  }

  render();
};

export const handleDataChanged = async (deps) => {
  const { store, render, projectService } = deps;
  const { tweens } = projectService.getState();

  const tweenData = tweens || { order: [], items: {} };

  store.setItems({ tweensData: tweenData });
  const selectedItemId = store.selectSelectedItemId();
  const selectedItem = store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  render();

  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId,
    });
  }
};

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  const { store, render } = deps;
  const detail = payload?._event?.detail || {};
  const id = resolveDetailItemId(detail);
  if (!id) {
    return;
  }

  store.setSelectedItemId({ itemId: id });
  const selectedItem = detail.item || store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  render();

  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId: id,
    });
  }
};

export const handleAnimationItemClick = (deps, payload) => {
  const { store, render, refs } = deps;
  const detail = payload?._event?.detail || {};
  const itemId = resolveDetailItemId(detail);
  if (!itemId) {
    return;
  }

  const { fileExplorer } = refs;
  fileExplorer.transformedHandlers.handlePageItemClick({
    _event: { detail: { itemId } },
  });

  store.setSelectedItemId({ itemId: itemId });
  const selectedItem = detail.item || store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  render();

  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId: itemId,
    });
  }
};

export const handleAnimationCreated = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { groupId, name, properties } = payload._event.detail;

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
    parentId: groupId,
    position: "last",
  });

  const { tweens } = projectService.getState();
  store.setItems({ tweensData: tweens });
  render();
};

export const handleAnimationUpdated = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { itemId, name, properties } = payload._event.detail;

  await projectService.updateResourceItem({
    resourceType: "tweens",
    resourceId: itemId,
    patch: {
      name,
      properties,
    },
  });

  const { tweens } = projectService.getState();
  store.setItems({ tweensData: tweens });
  const selectedItemId = store.selectSelectedItemId();
  const selectedItem = store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  render();

  if (selectedItem && selectedItemId === itemId) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId,
    });
  }
};

export const handleFormChange = async (deps, payload) => {
  const { projectService, render, store } = deps;
  const selectedItemId = store.selectSelectedItemId();
  await projectService.updateResourceItem({
    resourceType: "tweens",
    resourceId: selectedItemId,
    patch: {
      [payload._event.detail.name]: payload._event.detail.value,
    },
  });

  const { tweens } = projectService.getState();
  store.setItems({ tweensData: tweens });
  const selectedItem = store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  render();

  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId,
    });
  }
};

// Handlers forwarded from groupResourcesView
export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail.value || "";
  store.setSearchQuery({ query: searchQuery });
  render();
};

export const handleAddAnimationClick = async (deps, payload) => {
  const { store, render, graphicsService, refs } = deps;
  const { groupId } = payload._event.detail;
  store.setTargetGroupId({ groupId: groupId });
  store.openDialog();
  render();

  const { canvas } = refs;
  if (canvas && graphicsService) {
    await graphicsService.init({ canvas });
    graphicsService.render(resetState);
  }
};

export const handleAnimationItemDoubleClick = async (deps, payload) => {
  const { store, render, graphicsService, refs } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) return;

  const tweensData = store.selectTweensData();

  if (!tweensData || !tweensData.items) {
    return;
  }

  const itemData = tweensData.items[itemId];

  if (itemData) {
    // Find parent group
    let parent = null;
    for (const [key, value] of Object.entries(tweensData.items)) {
      if (value.children && value.children.includes(itemId)) {
        parent = key;
        break;
      }
    }

    store.openDialog({
      editMode: true,
      itemId,
      itemData: { ...itemData, parent },
    });
    render();

    const { canvas } = refs;
    if (canvas && graphicsService) {
      await graphicsService.init({ canvas });
      graphicsService.render(resetState);
    }
  }
};

// Dialog handlers
export const handleCloseDialog = (deps) => {
  const { store, render } = deps;
  store.closeDialog();
  render();
};

export const handleClosePopover = (deps) => {
  const { store, render } = deps;
  store.closePopover();
  render();
};

export const handleFormActionClick = (deps, payload) => {
  const { store, render } = deps;

  const actionId = payload._event.detail.actionId;

  if (actionId === "submit") {
    const formData = payload._event.detail.values;
    const formState = store.selectFormState();
    const { targetGroupId, editItemId, editMode, properties } = formState;

    if (editMode && editItemId) {
      handleAnimationUpdated(deps, {
        _event: {
          detail: {
            itemId: editItemId,
            name: formData.name,
            properties,
          },
        },
      });
    } else {
      handleAnimationCreated(deps, {
        _event: {
          detail: {
            groupId: targetGroupId,
            name: formData.name,
            properties,
          },
        },
      });
    }

    store.closeDialog();
    render();
  }
};

export const handleAddPropertiesClick = (deps, payload) => {
  const { store, render } = deps;

  store.setPopover({
    mode: "addProperty",
    x: payload._event.clientX,
    y: payload._event.clientY,
  });

  render();
};

export const handleAddPropertyFormSubmit = (deps, payload) => {
  const { store, render } = deps;
  const { property, initialValue, useInitialValue } =
    payload._event.detail.values;

  const defaultValues = {
    x: 960,
    y: 540,
    alpha: 1,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
  };

  const finalInitialValue = useInitialValue
    ? initialValue !== undefined
      ? initialValue
      : defaultValues[property] !== undefined
        ? defaultValues[property]
        : 0
    : defaultValues[property] !== undefined
      ? defaultValues[property]
      : 0;

  store.addProperty({ property, initialValue: finalInitialValue });
  store.closePopover();
  render();
};

export const handleAddKeyframeInDialog = (deps, payload) => {
  const { store, render } = deps;

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
  const { store, render } = deps;
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

  if (payload._event.detail.item.value === "edit") {
    store.setPopover({
      mode: "editKeyframe",
      x: x,
      y: y,
      payload: {
        property,
        index,
      },
    });
  } else if (payload._event.detail.item.value === "delete-property") {
    store.deleteProperty({ property });
    store.closePopover();
  } else if (payload._event.detail.item.value === "delete-keyframe") {
    store.deleteKeyframe({ property, index });
    store.closePopover();
  } else if (payload._event.detail.item.value === "add-right") {
    store.setPopover({
      mode: "addKeyframe",
      x: x,
      y: y,
      payload: {
        property,
        index: index + 1,
      },
    });
  } else if (payload._event.detail.item.value === "add-left") {
    store.setPopover({
      mode: "addKeyframe",
      x: x,
      y: y,
      payload: {
        property,
        index,
      },
    });
  } else if (payload._event.detail.item.value === "move-right") {
    store.moveKeyframeRight({ property, index });
    store.closePopover();
  } else if (payload._event.detail.item.value === "move-left") {
    store.moveKeyframeLeft({ property, index });
    store.closePopover();
  }

  render();
};

export const handleEditKeyframeFormSubmit = (deps, payload) => {
  const { store, render } = deps;
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

export const handleAddPropertyFormChange = (deps, payload) => {
  const { store, render } = deps;

  const { name, value: fieldValue } = payload._event.detail;

  const currentFormValues = store.selectPopover().formValues || {};
  const updatedFormValues = {
    ...currentFormValues,
    [name]: fieldValue,
  };
  store.updatePopoverFormValues({ formValues: updatedFormValues });
  render();
};

export const handleEditInitialValueFormChange = (deps, payload) => {
  const { store, render } = deps;

  const { name, value: fieldValue } = payload._event.detail;

  const currentFormValues = store.selectPopover().formValues || {};
  const updatedFormValues = {
    ...currentFormValues,
    [name]: fieldValue,
  };

  store.updatePopoverFormValues({ formValues: updatedFormValues });
  render();
};

export const handleReplayAnimation = async (deps) => {
  const { store, graphicsService } = deps;

  if (!graphicsService || !store.selectIsGraphicsServiceInitialized()) {
    return;
  }

  await graphicsService.render(resetState);

  setTimeout(() => {
    const renderState = store.selectAnimationRenderStateWithAnimations();
    graphicsService.render(renderState);
  }, 100);
};

export const handleEditInitialValueFormSubmit = (deps, payload) => {
  const { store, render } = deps;
  const {
    payload: { property },
  } = store.selectPopover();

  const { initialValue, valueSource } = payload._event.detail.values;

  const defaultValues = {
    x: 960,
    y: 540,
    alpha: 1,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
  };

  const finalInitialValue =
    valueSource === "default" || initialValue === undefined
      ? defaultValues[property] !== undefined
        ? defaultValues[property]
        : 0
      : initialValue;

  store.updateInitialValue({
    property,
    initialValue: finalInitialValue,
  });
  store.closePopover();
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, appService, store, render } = deps;
  const { resourceType, itemId } = payload._event.detail;

  const state = projectService.getState();
  const usage = recursivelyCheckResource({
    state,
    itemId,
    checkTargets: ["scenes", "layouts"],
  });

  if (usage.isUsed) {
    appService.showToast("Cannot delete resource, it is currently in use.");
    render();
    return;
  }

  // Perform the delete operation
  await projectService.deleteResourceItem({
    resourceType,
    resourceId: itemId,
  });

  // Refresh data and update store (reuse existing logic from handleDataChanged)
  const data = projectService.getState()[resourceType];
  store.setItems({ tweensData: data });
  render();
};
