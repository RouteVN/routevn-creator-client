import { nanoid } from "nanoid";
import { resetState } from "./tweens.constants";
import {
  recursivelyCheckResource,
  SCENE_RESOURCE_KEYS,
  LAYOUT_RESOURCE_KEYS,
} from "../../utils/resourceUsageChecker.js";

export const handleAfterMount = async (deps) => {
  const { store, projectService, render, graphicsService, getRefIds } = deps;
  await projectService.ensureRepository();
  const { tweens } = projectService.getState();
  store.setItems(tweens || { tree: [], items: {} });

  // Initialize graphicsService if canvas is present
  const { canvas } = getRefIds();
  if (
    graphicsService &&
    canvas &&
    canvas.elm &&
    !store.selectIsGraphicsServiceInitialized()
  ) {
    await graphicsService.init({
      canvas: canvas.elm,
    });
    store.setGraphicsServiceInitialized(true);
  }

  render();
};

export const handleDataChanged = async (deps) => {
  const { store, render, projectService } = deps;
  const { tweens } = projectService.getState();

  const tweenData = tweens || { tree: [], items: {} };

  store.setItems(tweenData);
  render();
};

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  const { store, render } = deps;
  const { id } = payload._event.detail;

  store.setSelectedItemId(id);
  render();
};

export const handleAnimationItemClick = (deps, payload) => {
  const { store, render, getRefIds } = deps;
  const { itemId } = payload._event.detail; // Extract from forwarded event

  const { fileExplorer } = getRefIds();
  fileExplorer.elm.transformedHandlers.handlePageItemClick({
    _event: { detail: { itemId } },
  });

  store.setSelectedItemId(itemId);
  render();
};

export const handleAnimationCreated = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { groupId, name, properties } = payload._event.detail;

  await projectService.appendEvent({
    type: "treePush",
    payload: {
      target: "tweens",
      value: {
        id: nanoid(),
        type: "tween",
        name: name,
        duration: "4s",
        keyframes: 3,
        properties,
      },
      options: {
        parent: groupId,
        position: "last",
      },
    },
  });

  const { tweens } = projectService.getState();
  store.setItems(tweens);
  render();
};

export const handleAnimationUpdated = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { itemId, name, properties } = payload._event.detail;

  await projectService.appendEvent({
    type: "treeUpdate",
    payload: {
      target: "tweens",
      value: {
        name: name,
        properties,
      },
      options: {
        id: itemId,
        replace: false,
      },
    },
  });

  const { tweens } = projectService.getState();
  store.setItems(tweens);
  render();
};

export const handleFormChange = async (deps, payload) => {
  const { projectService, render, store } = deps;
  await projectService.appendEvent({
    type: "treeUpdate",
    payload: {
      target: "tweens",
      value: {
        [payload._event.detail.name]: payload._event.detail.fieldValue,
      },
      options: {
        id: store.selectSelectedItemId(),
        replace: false,
      },
    },
  });

  const { tweens } = projectService.getState();
  store.setItems(tweens);
  render();
};

// Handlers forwarded from groupResourcesView
export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail.value || "";
  store.setSearchQuery(searchQuery);
  render();
};

export const handleAddAnimationClick = async (deps, payload) => {
  const { store, render, graphicsService } = deps;
  const { groupId } = payload._event.detail;
  store.setTargetGroupId(groupId);
  store.openDialog();
  if (graphicsService) {
    graphicsService.render(resetState);
  }
  render();
};

export const handleAnimationItemDoubleClick = async (deps, payload) => {
  const { store, render, graphicsService } = deps;
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

    if (graphicsService) {
      graphicsService.render(resetState);
    }
    store.openDialog({
      editMode: true,
      itemId,
      itemData: { ...itemData, parent },
    });
    render();
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
    const formData = payload._event.detail.formValues;
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
    payload._event.detail.formValues;

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

  const formValues = payload._event.detail.formValues;

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

  const formValues = payload._event.detail.formValues;

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

  const { name, fieldValue } = payload._event.detail;

  const currentFormValues = store.selectPopover().formValues || {};
  const updatedFormValues = {
    ...currentFormValues,
    [name]: fieldValue,
  };
  store.updatePopoverFormValues(updatedFormValues);
  render();
};

export const handleEditInitialValueFormChange = (deps, payload) => {
  const { store, render } = deps;

  const { name, fieldValue } = payload._event.detail;

  const currentFormValues = store.selectPopover().formValues || {};
  const updatedFormValues = {
    ...currentFormValues,
    [name]: fieldValue,
  };

  store.updatePopoverFormValues(updatedFormValues);
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
    console.log(renderState);
    graphicsService.render(renderState);
  }, 100);
};

export const handleEditInitialValueFormSubmit = (deps, payload) => {
  const { store, render } = deps;
  const {
    payload: { property },
  } = store.selectPopover();

  const { initialValue, valueSource } = payload._event.detail.formValues;

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
    checkTargets: [
      { name: "scenes", keys: SCENE_RESOURCE_KEYS },
      { name: "layouts", keys: LAYOUT_RESOURCE_KEYS },
    ],
  });

  if (usage.isUsed) {
    appService.showToast("Cannot delete resource, it is currently in use.");
    render();
    return;
  }

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
